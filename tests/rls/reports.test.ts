// Report hub: favorites are private to each person, and the sales tax report only sees the caller's company.
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("reports (favorites, sales tax)", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { ownerA: randomUUID(), ownerB: randomUUID(), office: randomUUID() };
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
    for (const [k, v] of Object.entries(id)) await sql`insert into auth.users (id, email) values (${v}, ${`rp-${k}-${v}@test.local`})`;
    tA = await createTenant(id.ownerA, "Report Alpha");
    tB = await createTenant(id.ownerB, "Report Beta");
    await sql`insert into public.profiles (id, email) values (${id.office}, ${`office-${id.office}@test.local`}) on conflict do nothing`;
    await sql`insert into public.memberships (tenant_id, user_id, role) values (${tA}, ${id.office}, 'office_staff')`;
    custA = (await sql`insert into public.customers (tenant_id, first_name, status) values (${tA}, 'Ann', 'active') returning id`)[0].id;
    custB = (await sql`insert into public.customers (tenant_id, first_name, status) values (${tB}, 'Bob', 'active') returning id`)[0].id;
    for (const [t, c, name] of [[tA, custA, "Ann"], [tB, custB, "Bob"]] as const) {
      const inv = (await sql`insert into public.invoices (tenant_id, customer_id, customer_name, status, issue_date, due_date, tax_rate)
        values (${t}, ${c}, ${name}, 'sent', '2099-05-10', '2099-05-25', 8) returning id`)[0].id;
      await sql`insert into public.invoice_lines (tenant_id, invoice_id, description, quantity, unit_price_cents) values (${t}, ${inv}, 'Clean', 1, 10000)`;
    }
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tA}, ${tB})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  it("favorites are private to the person, inside their own company", async () => {
    await as(id.ownerA, async (tx) => {
      await tx`insert into public.report_favorites (tenant_id, user_id, report_key) values (${tA}, ${id.ownerA}, 'sales_tax')`;
      expect(await tx`select 1 from public.report_favorites`).toHaveLength(1);
      // starring for someone else, or in another company, is refused
      await tx`savepoint a`;
      await expect(tx`insert into public.report_favorites (tenant_id, user_id, report_key) values (${tA}, ${id.office}, 'sales_tax')`).rejects.toThrow();
      await tx`rollback to savepoint a`;
      await tx`savepoint b`;
      await expect(tx`insert into public.report_favorites (tenant_id, user_id, report_key) values (${tB}, ${id.ownerA}, 'sales_tax')`).rejects.toThrow();
      await tx`rollback to savepoint b`;
      await tx`savepoint c`;
      await expect(tx`insert into public.report_favorites (tenant_id, user_id, report_key) values (${tA}, ${id.ownerA}, 'Bad Key!')`).rejects.toThrow();
      await tx`rollback to savepoint c`;
      // a coworker can't see or remove it
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id.office, role: "authenticated" })}, true)`;
      expect(await tx`select 1 from public.report_favorites`).toHaveLength(0);
      expect((await tx`delete from public.report_favorites where report_key = 'sales_tax'`).count).toBe(0);
    });
  });

  it("sales tax report: taxable amount and tax per invoice, own company only", async () => {
    await as(id.ownerA, async (tx) => {
      const rows = await tx`select customer_name, taxable_cents, tax_rate, tax_cents, total_cents from public.report_sales_tax('2099-05-01', '2099-05-31')`;
      expect(rows).toHaveLength(1);
      expect([rows[0].customer_name, Number(rows[0].taxable_cents), Number(rows[0].tax_cents), Number(rows[0].total_cents)]).toEqual(["Ann", 10000, 800, 10800]);
      expect(await tx`select 1 from public.report_sales_tax('2098-01-01', '2098-12-31')`).toHaveLength(0);
    });
    await as(id.ownerB, async (tx) => {
      const rows = await tx`select customer_name from public.report_sales_tax('2099-05-01', '2099-05-31')`;
      expect(rows.map((r) => r.customer_name)).toEqual(["Bob"]);
    });
  });
});
