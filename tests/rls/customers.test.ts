// Phase 2 security tests: customers, history, conversion, public intake. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

class Rollback extends Error {}

d("customers (RLS, history, conversion, public intake)", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { ownerA: randomUUID(), ownerB: randomUUID(), office: randomUUID(), employee: randomUUID(), accountant: randomUUID() };
  let tenantA = "", tenantB = "", slugA = "", slugB = "";

  /** Run as a signed-in user (role authenticated, JWT claims). Always rolled back. */
  async function as<T>(uid: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    let out!: T;
    try {
      await sql.begin(async (tx) => {
        if (uid) {
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
          await tx`set local role authenticated`;
        } else {
          await tx`set local role anon`;
        }
        out = await fn(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    return out;
  }

  const newCustomer = (tx: postgres.TransactionSql, tenant: string, by: string, extra: Record<string, unknown> = {}) =>
    tx`insert into public.customers ${tx({ tenant_id: tenant, created_by: by, first_name: "Ana", last_name: "Lopez", ...extra })} returning id`;

  beforeAll(async () => {
    for (const [k, v] of Object.entries(id)) {
      await sql`insert into auth.users (id, email) values (${v}, ${`c-${k}-${v}@test.local`})`;
    }
    const mk = async (uid: string, name: string) => {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        await tx`select public.create_tenant(${name})`;
      });
      const [t] = await sql`select t.id, t.public_slug from public.tenants t join public.memberships m on m.tenant_id = t.id where m.user_id = ${uid}`;
      return t;
    };
    const a = await mk(id.ownerA, "Alpha Cleaning");
    const b = await mk(id.ownerB, "Beta Cleaning");
    [tenantA, slugA, tenantB, slugB] = [a.id, a.public_slug, b.id, b.public_slug];
    for (const [uid, role] of [[id.office, "office_staff"], [id.employee, "employee"], [id.accountant, "accountant"]] as const) {
      await sql`insert into public.profiles (id, email) values (${uid}, ${`${role}@test.local`})`;
      await sql`insert into public.memberships (tenant_id, user_id, role) values (${tenantA}, ${uid}, ${role})`;
    }
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tenantA}, ${tenantB})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  it("tenants get an unguessable public slug", () => {
    expect(slugA).toMatch(/^alpha-cleaning-[0-9a-f]{6}$/);
    expect(slugA).not.toBe(slugB);
  });

  it("office staff can create and read customers; creator must be themselves", async () => {
    await as(id.office, async (tx) => {
      const [c] = await newCustomer(tx, tenantA, id.office);
      expect((await tx`select 1 from public.customers where id = ${c.id}`).length).toBe(1);
    });
    await expect(as(id.office, (tx) => newCustomer(tx, tenantA, id.ownerA))).rejects.toThrow(); // forged created_by
  });

  it("employee and accountant roles have no access to customers", async () => {
    await as(id.ownerA, async (tx) => { await newCustomer(tx, tenantA, id.ownerA); });
    // data must exist outside the rolled-back txs: create one committed row as superuser
    const [row] = await sql`insert into public.customers (tenant_id, first_name) values (${tenantA}, 'Visible') returning id`;
    for (const uid of [id.employee, id.accountant]) {
      await as(uid, async (tx) => {
        expect(await tx`select 1 from public.customers`).toHaveLength(0);
        expect(await tx`select 1 from public.customer_events`).toHaveLength(0);
      });
      await expect(as(uid, (tx) => newCustomer(tx, tenantA, uid))).rejects.toThrow();
    }
    await as(id.ownerA, async (tx) => {
      expect((await tx`select 1 from public.customers where id = ${row.id}`).length).toBe(1);
    });
  });

  it("another company cannot read, update, insert or convert", async () => {
    const [row] = await sql`insert into public.customers (tenant_id, first_name) values (${tenantA}, 'Private') returning id`;
    await as(id.ownerB, async (tx) => {
      expect(await tx`select 1 from public.customers where id = ${row.id}`).toHaveLength(0);
      expect((await tx`update public.customers set notes = 'x' where id = ${row.id}`).count).toBe(0);
      expect(await tx`select 1 from public.customer_events where customer_id = ${row.id}`).toHaveLength(0);
    });
    await expect(as(id.ownerB, (tx) => newCustomer(tx, tenantA, id.ownerB))).rejects.toThrow();
    await expect(as(id.ownerB, (tx) => tx`select public.convert_customer(${row.id})`)).rejects.toThrow();
  });

  it("tenant_id, source and created_by cannot be changed; rows cannot be deleted", async () => {
    const [row] = await sql`insert into public.customers (tenant_id, first_name) values (${tenantA}, 'Fixed') returning id`;
    await expect(as(id.ownerA, (tx) => tx`update public.customers set tenant_id = ${tenantB} where id = ${row.id}`)).rejects.toThrow();
    await expect(as(id.ownerA, (tx) => tx`update public.customers set source = 'web_form' where id = ${row.id}`)).rejects.toThrow();
    await expect(as(id.ownerA, (tx) => tx`delete from public.customers where id = ${row.id}`)).rejects.toThrow();
  });

  it("history is written by the database and cannot be forged", async () => {
    await as(id.office, async (tx) => {
      const [c] = await newCustomer(tx, tenantA, id.office);
      await tx`update public.customers set notes = 'called' where id = ${c.id}`;
      await tx`update public.customers set status = 'inactive' where id = ${c.id}`;
      const ev = await tx`select type from public.customer_events where customer_id = ${c.id} order by id`;
      expect(ev.map((e) => e.type)).toEqual(["created", "updated", "status_changed"]);
    });
    const [row] = await sql`insert into public.customers (tenant_id, first_name) values (${tenantA}, 'Hist') returning id`;
    await expect(
      as(id.ownerA, (tx) => tx`insert into public.customer_events (tenant_id, customer_id, type) values (${tenantA}, ${row.id}, 'created')`),
    ).rejects.toThrow();
  });

  it("converting a prospect keeps the same record and history, and cannot run twice", async () => {
    await as(id.office, async (tx) => {
      const [c] = await newCustomer(tx, tenantA, id.office, { status: "prospect", email: "ana@example.com" });
      await tx`select public.convert_customer(${c.id})`;
      const rows = await tx`select id, status, customer_since, converted_at from public.customers where email = 'ana@example.com' and tenant_id = ${tenantA}`;
      expect(rows).toHaveLength(1); // no duplicate
      expect(rows[0].id).toBe(c.id);
      expect(rows[0].status).toBe("active");
      expect(rows[0].customer_since).not.toBeNull();
      expect(rows[0].converted_at).not.toBeNull();
      const ev = await tx`select type from public.customer_events where customer_id = ${c.id} order by id`;
      expect(ev.map((e) => e.type)).toEqual(["created", "converted"]);
      await expect(tx.savepoint((sp) => sp`select public.convert_customer(${c.id})`)).rejects.toThrow();
    });
  });

  it("employee cannot convert a prospect", async () => {
    const [row] = await sql`insert into public.customers (tenant_id, first_name) values (${tenantA}, 'Prospect') returning id`;
    await expect(as(id.employee, (tx) => tx`select public.convert_customer(${row.id})`)).rejects.toThrow();
  });

  describe("public intake (anonymous visitors)", () => {
    const valid = { first_name: "Maria", email: "maria@example.com", message: "Need a deep clean", bedrooms: "3", bathrooms: "2.5" };

    it("anon can submit to a valid slug and gets a web_form prospect, nothing else", async () => {
      await sql`select public.submit_quote_request(${slugA}, ${sql.json({ ...valid, tenant_id: tenantB, status: "active" })})`.catch(() => {});
      // run for real via anon role and commit by using superuser afterwards
      await sql.begin(async (tx) => {
        await tx`set local role anon`;
        await tx`select public.submit_quote_request(${slugA}, ${tx.json({ ...valid, tenant_id: tenantB, status: "active" })})`;
        await tx`reset role`;
        const rows = await tx`select tenant_id, status, source, bathrooms, bedrooms from public.customers where email = 'maria@example.com' order by created_at desc limit 1`;
        expect(rows[0].tenant_id).toBe(tenantA); // payload cannot redirect to another tenant
        expect(rows[0].status).toBe("prospect"); // payload cannot set status
        expect(rows[0].source).toBe("web_form");
        expect(Number(rows[0].bathrooms)).toBe(2.5);
        expect(rows[0].bedrooms).toBe(3);
        const ev = await tx`select actor_id from public.customer_events where type = 'created' order by id desc limit 1`;
        expect(ev[0].actor_id).toBeNull();
        throw new Rollback();
      }).catch((e) => { if (!(e instanceof Rollback)) throw e; });
    });

    it("anon cannot read anything", async () => {
      for (const table of ["customers", "customer_events", "tenants", "memberships", "tenant_settings"]) {
        await expect(as(null, (tx) => tx.unsafe(`select 1 from public.${table}`))).rejects.toThrow();
      }
    });

    it("rejects unknown slugs, closed forms, bad email and empty requests", async () => {
      await expect(as(null, (tx) => tx`select public.submit_quote_request('nope-000000', ${tx.json(valid)})`)).rejects.toThrow();
      await expect(as(null, (tx) => tx`select public.submit_quote_request(${slugA}, ${tx.json({ first_name: "A", email: "not-an-email" })})`)).rejects.toThrow();
      await expect(as(null, (tx) => tx`select public.submit_quote_request(${slugA}, ${tx.json({ message: "hi" })})`)).rejects.toThrow();
      await sql`update public.tenants set accepts_requests = false where id = ${tenantB}`;
      await expect(as(null, (tx) => tx`select public.submit_quote_request(${slugB}, ${tx.json(valid)})`)).rejects.toThrow();
      expect(await as(null, (tx) => tx`select public.public_company_name(${slugB}) as n`).then((r) => r[0].n)).toBeNull();
      await sql`update public.tenants set accepts_requests = true where id = ${tenantB}`;
    });

    it("exposes only the company name for a valid slug", async () => {
      const r = await as(null, (tx) => tx`select public.public_company_name(${slugA}) as n`);
      expect(r[0].n).toBe("Alpha Cleaning");
    });

    it("throttles floods: max 30 web requests per company per 10 minutes", async () => {
      await sql.begin(async (tx) => {
        await tx`insert into public.customers (tenant_id, first_name, source) select ${tenantB}, 'Spam', 'web_form' from generate_series(1, 30)`;
        await tx`set local role anon`;
        await expect(tx.savepoint((sp) => sp`select public.submit_quote_request(${slugB}, ${sp.json(valid)})`)).rejects.toThrow();
        throw new Rollback();
      }).catch((e) => { if (!(e instanceof Rollback)) throw e; });
    });
  });
});
