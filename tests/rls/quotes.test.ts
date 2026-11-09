// Phase 3b security + math tests: quotes, numbering, totals, status flow. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("quotes (RLS, numbering, totals, status)", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { ownerA: randomUUID(), ownerB: randomUUID(), employee: randomUUID(), accountant: randomUUID(), office: randomUUID() };
  let tA = "", tB = "", custA = "", custB = "";

  async function as<T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    let out!: T;
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        await tx`set constraints all immediate`;
        out = await fn(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    return out;
  }

  async function createTenant(uid: string, name: string): Promise<string> {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      await tx`select public.create_tenant(${name}, 'en')`;
    });
    return (await sql`select tenant_id from public.memberships where user_id = ${uid}`)[0].tenant_id;
  }

  beforeAll(async () => {
    for (const [k, v] of Object.entries(id)) await sql`insert into auth.users (id, email) values (${v}, ${`q-${k}-${v}@test.local`})`;
    tA = await createTenant(id.ownerA, "Quote Alpha");
    tB = await createTenant(id.ownerB, "Quote Beta");
    for (const [uid, role] of [[id.employee, "employee"], [id.accountant, "accountant"], [id.office, "office_staff"]] as const) {
      await sql`insert into public.profiles (id, email) values (${uid}, ${`${role}@test.local`})`;
      await sql`insert into public.memberships (tenant_id, user_id, role) values (${tA}, ${uid}, ${role})`;
    }
    custA = (await sql`insert into public.customers (tenant_id, first_name, status) values (${tA}, 'Ann', 'active') returning id`)[0].id;
    custB = (await sql`insert into public.customers (tenant_id, first_name, status) values (${tB}, 'Bob', 'active') returning id`)[0].id;
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tA}, ${tB})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  const newQuote = (tx: postgres.TransactionSql, tenant: string, cust: string, uid: string, extra = {}) =>
    tx`insert into public.quotes ${tx({ tenant_id: tenant, customer_id: cust, expires_on: "2099-01-01", created_by: uid, ...extra })} returning id, number`;

  it("numbers are sequential per company and ignore client-supplied values", async () => {
    await as(id.ownerA, async (tx) => {
      const a = (await newQuote(tx, tA, custA, id.ownerA, { number: 999 }))[0];
      const b = (await newQuote(tx, tA, custA, id.ownerA))[0];
      expect(b.number).toBe(a.number + 1);
      expect(a.number).not.toBe(999);
    });
    await as(id.ownerB, async (tx) => {
      expect((await newQuote(tx, tB, custB, id.ownerB))[0].number).toBe(1); // independent counter
    });
  });

  it("totals: base + lines, capped fixed discount, tax after discount, one row per option", async () => {
    await as(id.ownerA, async (tx) => {
      const q = (await newQuote(tx, tA, custA, id.ownerA, { discount_cents: 1000, tax_rate: 8.25 }))[0];
      await tx`insert into public.quote_options (tenant_id, quote_id, name, base_price_cents, position) values
        (${tA}, ${q.id}, 'Good', 10000, 1), (${tA}, ${q.id}, 'Better', 15000, 2)`;
      await tx`insert into public.quote_lines (tenant_id, quote_id, description, quantity, unit_price_cents) values
        (${tA}, ${q.id}, 'Oven', 2, 2500), (${tA}, ${q.id}, 'Fridge', 1, 1999)`;
      const rows = await tx`select * from public.quote_totals(${q.id})`;
      expect(rows).toHaveLength(2);
      // Good: 10000 + 5000 + 1999 = 16999; -1000 = 15999; tax 8.25% = 1319.9 → 1320; total 17319
      expect(Number(rows[0].subtotal_cents)).toBe(16999);
      expect(Number(rows[0].tax_cents)).toBe(1320);
      expect(Number(rows[0].total_cents)).toBe(17319);
      expect(Number(rows[1].total_cents)).toBeGreaterThan(Number(rows[0].total_cents));
      const [ov] = await tx`select total_cents, display_status from public.quotes_overview where id = ${q.id}`;
      expect(Number(ov.total_cents)).toBe(17319); // headline = first option
      expect(ov.display_status).toBe("draft");
    });
  });

  it("discount never exceeds the subtotal; no options → single row from lines", async () => {
    await as(id.ownerA, async (tx) => {
      const q = (await newQuote(tx, tA, custA, id.ownerA, { discount_cents: 99999 }))[0];
      await tx`insert into public.quote_lines (tenant_id, quote_id, description, unit_price_cents) values (${tA}, ${q.id}, 'Clean', 5000)`;
      const [r] = await tx`select * from public.quote_totals(${q.id})`;
      expect(r.option_id).toBeNull();
      expect(Number(r.total_cents)).toBe(0);
    });
  });

  it("past expiry date shows as expired (derived), still draft in the database", async () => {
    await as(id.ownerA, async (tx) => {
      const q = (await newQuote(tx, tA, custA, id.ownerA, { expires_on: "2000-01-01" }))[0];
      const [ov] = await tx`select status, display_status from public.quotes_overview where id = ${q.id}`;
      expect(ov.status).toBe("draft");
      expect(ov.display_status).toBe("expired");
    });
  });

  it("isolation and roles: other company, employee and accountant see nothing; office can write", async () => {
    const qid = (await sql`insert into public.quotes (tenant_id, customer_id, expires_on) values (${tA}, ${custA}, '2099-01-01') returning id`)[0].id;
    await as(id.ownerB, async (tx) => {
      expect(await tx`select 1 from public.quotes where id = ${qid}`).toHaveLength(0);
      expect(await tx`select 1 from public.quotes_overview where id = ${qid}`).toHaveLength(0);
      expect((await tx`update public.quotes set title = 'x' where id = ${qid}`).count).toBe(0);
    });
    for (const u of [id.employee, id.accountant])
      await as(u, async (tx) => {
        expect(await tx`select 1 from public.quotes where id = ${qid}`).toHaveLength(0);
        await expect(tx`savepoint s`.then(() => newQuote(tx, tA, custA, u))).rejects.toThrow();
      });
    await as(id.office, async (tx) => {
      expect(await newQuote(tx, tA, custA, id.office)).toHaveLength(1);
    });
  });

  it("cannot create a quote for another company's customer, or forge status/creator", async () => {
    await expect(as(id.ownerA, (tx) => newQuote(tx, tA, custB, id.ownerA))).rejects.toThrow();
    await expect(as(id.ownerA, (tx) => newQuote(tx, tA, custA, id.ownerA, { status: "accepted" }))).rejects.toThrow();
    await expect(as(id.ownerA, (tx) => newQuote(tx, tA, custA, randomUUID()))).rejects.toThrow();
  });

  it("status flow: draft → sent → accepted (option required), then locked", async () => {
    await as(id.ownerA, async (tx) => {
      const q = (await newQuote(tx, tA, custA, id.ownerA))[0];
      await tx`insert into public.quote_options (tenant_id, quote_id, name, base_price_cents) values (${tA}, ${q.id}, 'Good', 100)`;
      await expect(tx`savepoint a`.then(() => tx`update public.quotes set status = 'accepted' where id = ${q.id}`)).rejects.toThrow(); // no direct status writes
    });
    await as(id.ownerA, async (tx) => {
      const q = (await newQuote(tx, tA, custA, id.ownerA))[0];
      const o = (await tx`insert into public.quote_options (tenant_id, quote_id, name, base_price_cents) values (${tA}, ${q.id}, 'Good', 100) returning id`)[0].id;
      await tx`select public.set_quote_status(${q.id}, 'sent')`;
      await tx`savepoint s1`;
      await expect(tx`select public.set_quote_status(${q.id}, 'accepted')`).rejects.toThrow(/option required/);
      await tx`rollback to savepoint s1`;
      await tx`select public.set_quote_status(${q.id}, 'accepted', ${o})`;
      const [r] = await tx`select status, selected_option_id, sent_at, responded_at from public.quotes where id = ${q.id}`;
      expect(r.status).toBe("accepted");
      expect(r.selected_option_id).toBe(o);
      expect(r.sent_at).not.toBeNull();
      await tx`savepoint s2`;
      await expect(tx`select public.set_quote_status(${q.id}, 'declined')`).rejects.toThrow(/invalid transition/);
      await tx`rollback to savepoint s2`;
      // Locked: content edits and line changes affect nothing.
      expect((await tx`update public.quotes set title = 'x' where id = ${q.id}`).count).toBe(0);
      expect((await tx`delete from public.quotes where id = ${q.id}`).count).toBe(0);
      await expect(tx`insert into public.quote_lines (tenant_id, quote_id, description) values (${tA}, ${q.id}, 'late')`).rejects.toThrow();
    });
  });

  it("status function rejects other companies and non-quote roles", async () => {
    const qid = (await sql`insert into public.quotes (tenant_id, customer_id, expires_on) values (${tA}, ${custA}, '2099-01-01') returning id`)[0].id;
    await expect(as(id.ownerB, (tx) => tx`select public.set_quote_status(${qid}, 'sent')`)).rejects.toThrow();
    await expect(as(id.employee, (tx) => tx`select public.set_quote_status(${qid}, 'sent')`)).rejects.toThrow();
    await expect(as(id.ownerB, (tx) => tx`select public.duplicate_quote(${qid})`)).rejects.toThrow();
  });

  it("duplicate creates a new draft with a new number and copies options and lines", async () => {
    await as(id.ownerA, async (tx) => {
      const q = (await newQuote(tx, tA, custA, id.ownerA, { discount_cents: 500, tax_rate: 5 }))[0];
      await tx`insert into public.quote_options (tenant_id, quote_id, name, base_price_cents) values (${tA}, ${q.id}, 'Good', 100)`;
      await tx`insert into public.quote_lines (tenant_id, quote_id, description, unit_price_cents) values (${tA}, ${q.id}, 'x', 50)`;
      await tx`select public.set_quote_status(${q.id}, 'sent')`;
      const nid = (await tx`select public.duplicate_quote(${q.id}) as id`)[0].id;
      const [n] = await tx`select status, number, discount_cents, tax_rate from public.quotes where id = ${nid}`;
      expect(n.status).toBe("draft");
      expect(n.number).toBeGreaterThan(q.number);
      expect(Number(n.tax_rate)).toBe(5);
      expect((await tx`select 1 from public.quote_options where quote_id = ${nid}`)).toHaveLength(1);
      expect((await tx`select 1 from public.quote_lines where quote_id = ${nid}`)).toHaveLength(1);
    });
  });
});
