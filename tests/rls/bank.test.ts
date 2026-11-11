// Bank statements: categories (two levels) and transactions belong to one company, and owner and admin manage them and the accountant only reads.
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("bank statements", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { ownerA: randomUUID(), ownerB: randomUUID(), office: randomUUID(), accountant: randomUUID() };
  let tA = "", tB = "";

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
    for (const [k, v] of Object.entries(id)) await sql`insert into auth.users (id, email) values (${v}, ${`bk-${k}-${v}@test.local`})`;
    tA = await createTenant(id.ownerA, "Bank Alpha");
    tB = await createTenant(id.ownerB, "Bank Beta");
    for (const [u, role] of [[id.office, "office_staff"], [id.accountant, "accountant"]] as const) {
      await sql`insert into public.profiles (id, email) values (${u}, ${`bk-${role}-${u}@test.local`}) on conflict do nothing`;
      await sql`insert into public.memberships (tenant_id, user_id, role) values (${tA}, ${u}, ${role})`;
    }
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tA}, ${tB})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  it("seeds the starter categories once", async () => {
    await as(id.ownerA, async (tx) => {
      await tx`select public.ensure_bank_categories(${tA}, 'es')`;
      await tx`select public.ensure_bank_categories(${tA}, 'es')`;
      const rows = await tx`select name, parent_id from public.bank_categories`;
      expect(rows.filter((r) => !r.parent_id).map((r) => r.name)).toEqual(expect.arrayContaining(["Vehicle Expenses", "Income", "Bank Charges & Fees"]));
      expect(rows.some((r) => r.name === "Gas/Fuel")).toBe(true);
      const count = rows.length;
      await tx`select public.ensure_bank_categories(${tA}, 'es')`;
      expect(await tx`select 1 from public.bank_categories`).toHaveLength(count);
    });
  });

  it("only allows two category levels and no duplicate names", async () => {
    await as(id.ownerA, async (tx) => {
      const [p] = await tx`insert into public.bank_categories (tenant_id, name) values (${tA}, 'Parent') returning id`;
      const [c] = await tx`insert into public.bank_categories (tenant_id, parent_id, name) values (${tA}, ${p.id}, 'Child') returning id`;
      await tx`savepoint a`;
      await expect(tx`insert into public.bank_categories (tenant_id, parent_id, name) values (${tA}, ${c.id}, 'Grandchild')`).rejects.toThrow(/two category levels/);
      await tx`rollback to savepoint a`;
      await tx`savepoint b`;
      await expect(tx`insert into public.bank_categories (tenant_id, name) values (${tA}, 'parent')`).rejects.toThrow();
      await tx`rollback to savepoint b`;
      await tx`savepoint c`;
      await expect(tx`update public.bank_categories set parent_id = ${c.id} where id = ${p.id}`).rejects.toThrow();
      await tx`rollback to savepoint c`;
    });
  });

  it("keeps transactions inside the company, with no duplicates", async () => {
    await as(id.ownerA, async (tx) => {
      const [cat] = await tx`insert into public.bank_categories (tenant_id, name) values (${tA}, 'Misc') returning id`;
      await tx`insert into public.bank_transactions (tenant_id, tx_date, description, amount_cents, category_id, dedupe_key, created_by) values (${tA}, '2099-01-02', 'Zelle', 15000, ${cat.id}, 'k1', ${id.ownerA})`;
      await tx`savepoint a`;
      await expect(tx`insert into public.bank_transactions (tenant_id, tx_date, description, amount_cents, dedupe_key, created_by) values (${tA}, '2099-01-02', 'Zelle', 15000, 'k1', ${id.ownerA})`).rejects.toThrow();
      await tx`rollback to savepoint a`;
      await tx`savepoint b`;
      await expect(tx`insert into public.bank_transactions (tenant_id, tx_date, description, amount_cents, dedupe_key, created_by) values (${tA}, '2099-01-02', 'Zero', 0, 'k2', ${id.ownerA})`).rejects.toThrow();
      await tx`rollback to savepoint b`;
      await tx`savepoint c`;
      await expect(tx`insert into public.bank_transactions (tenant_id, tx_date, description, amount_cents, dedupe_key, created_by) values (${tB}, '2099-01-02', 'Other co', 100, 'k3', ${id.ownerA})`).rejects.toThrow();
      await tx`rollback to savepoint c`;
    });
    await as(id.ownerB, async (tx) => {
      expect(await tx`select 1 from public.bank_transactions`).toHaveLength(0);
      expect(await tx`select 1 from public.bank_categories where tenant_id = ${tA}`).toHaveLength(0);
      await tx`savepoint a`;
      await expect(tx`select public.ensure_bank_categories(${tA}, 'en')`).rejects.toThrow(/not allowed/);
      await tx`rollback to savepoint a`;
    });
  });

  it("is limited to owner and admin, with the accountant read-only", async () => {
    await sql`insert into public.bank_categories (tenant_id, name) values (${tA}, 'Seen by accountant')`;
    await as(id.accountant, async (tx) => {
      expect((await tx`select 1 from public.bank_categories where name = 'Seen by accountant'`).length).toBe(1);
      await tx`savepoint w`;
      await expect(tx`insert into public.bank_transactions (tenant_id, tx_date, description, amount_cents, dedupe_key, created_by) values (${tA}, '2099-01-03', 'Fee', -500, 'k9', ${id.accountant})`).rejects.toThrow();
      await tx`rollback to savepoint w`;
      await tx`savepoint x`;
      await expect(tx`select public.ensure_bank_categories(${tA}, 'en')`).rejects.toThrow(/not allowed/);
      await tx`rollback to savepoint x`;
    });
    await as(id.office, async (tx) => {
      expect((await tx`select 1 from public.bank_categories`).length).toBeGreaterThan(5); // office staff read the shared category list (for expenses)
      await tx`savepoint a`;
      await expect(tx`insert into public.bank_transactions (tenant_id, tx_date, description, amount_cents, dedupe_key, created_by) values (${tA}, '2099-01-03', 'Fee', -500, 'k8', ${id.office})`).rejects.toThrow();
      await tx`rollback to savepoint a`;
    });
  });

  it("keeps the bank's balances per company: one statement per period, owner writes, accountant reads", async () => {
    await as(id.ownerA, async (tx) => {
      await tx`insert into public.bank_statements (tenant_id, period_start, period_end, beginning_balance_cents, ending_balance_cents, created_by) values (${tA}, '2099-01-01', '2099-01-31', 100000, 79280, ${id.ownerA})`;
      await tx`savepoint a`;
      await expect(tx`insert into public.bank_statements (tenant_id, period_start, period_end, beginning_balance_cents, created_by) values (${tA}, '2099-01-01', '2099-01-31', 5, ${id.ownerA})`).rejects.toThrow();
      await tx`rollback to savepoint a`;
      await tx`savepoint b`;
      await expect(tx`insert into public.bank_statements (tenant_id, period_start, period_end, created_by) values (${tA}, '2099-02-01', '2099-02-28', ${id.ownerA})`).rejects.toThrow(); // needs at least one balance
      await tx`rollback to savepoint b`;
    });
    await sql`insert into public.bank_statements (tenant_id, period_start, period_end, beginning_balance_cents) values (${tA}, '2099-03-01', '2099-03-31', 1)`;
    await as(id.accountant, async (tx) => {
      expect(await tx`select 1 from public.bank_statements`).toHaveLength(1);
      await tx`savepoint a`;
      await expect(tx`insert into public.bank_statements (tenant_id, period_start, period_end, beginning_balance_cents, created_by) values (${tA}, '2099-04-01', '2099-04-30', 1, ${id.accountant})`).rejects.toThrow();
      await tx`rollback to savepoint a`;
    });
    await as(id.ownerB, async (tx) => expect(await tx`select 1 from public.bank_statements`).toHaveLength(0));
    await as(id.office, async (tx) => expect(await tx`select 1 from public.bank_statements`).toHaveLength(0));
  });
});
