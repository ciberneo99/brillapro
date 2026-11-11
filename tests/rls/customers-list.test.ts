// Customers list: rating, per-customer money and hours, summary figures. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("customers list figures", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { owner: randomUUID(), manager: randomUUID(), other: randomUUID() };
  let tid = "", tother = "", cust = "", job = "", otherCust = "";

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
    for (const [k, v] of Object.entries(id)) {
      await sql`insert into auth.users (id, email) values (${v}, ${`cl-${k}-${v}@test.local`})`;
      await sql`insert into public.profiles (id, email) values (${v}, ${`cl-${k}-${v}@test.local`}) on conflict do nothing`;
    }
    tid = await createTenant(id.owner, "List Alpha");
    tother = await createTenant(id.other, "List Beta");
    await sql`insert into public.memberships (tenant_id, user_id, role) values (${tid}, ${id.manager}, 'manager')`;

    cust = (await sql`insert into public.customers (tenant_id, status, first_name) values (${tid}, 'active', 'Ana') returning id`)[0].id;
    otherCust = (await sql`insert into public.customers (tenant_id, status, first_name) values (${tother}, 'active', 'Zed') returning id`)[0].id;
    // a 3h job with two people assigned, 2h30 clocked by one of them, still running for the other
    job = (await sql`insert into public.jobs (tenant_id, customer_id, title, status, scheduled_date, start_time, end_time, customer_name)
      values (${tid}, ${cust}, 'Weekly', 'in_progress', current_date, '09:00', '12:00', 'Ana') returning id`)[0].id;
    const e1 = (await sql`insert into public.employees (tenant_id, full_name) values (${tid}, 'E One') returning id`)[0].id;
    const e2 = (await sql`insert into public.employees (tenant_id, full_name) values (${tid}, 'E Two') returning id`)[0].id;
    await sql`insert into public.job_assignments (tenant_id, job_id, employee_id) values (${tid}, ${job}, ${e1}), (${tid}, ${job}, ${e2})`;
    await sql`insert into public.time_entries (tenant_id, employee_id, job_id, clock_in, clock_out) values (${tid}, ${e1}, ${job}, now() - interval '3 hours', now() - interval '30 minutes')`;
    const inv = (await sql`insert into public.invoices (tenant_id, customer_id, number, status, issue_date, due_date, customer_name)
      values (${tid}, ${cust}, 1, 'sent', current_date - 30, current_date - 10, 'Ana') returning id`)[0].id;
    await sql`insert into public.invoice_lines (tenant_id, invoice_id, description, quantity, unit_price_cents) values (${tid}, ${inv}, 'Clean', 1, 8500)`;
    await sql`insert into public.quotes (tenant_id, customer_id, number, status) values (${tid}, ${cust}, 1, 'draft')`.catch(() => {});
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tid}, ${tother})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  it("owner sees outstanding, overdue and hours against planned labor time", async () => {
    await as(id.owner, async (tx) => {
      const [x] = await tx`select * from public.customer_list_extras(${[cust]})`;
      expect([Number(x.outstanding_cents), Number(x.overdue_cents)]).toEqual([8500, 8500]);
      expect(x.job_id).toBe(job);
      expect([x.planned_minutes, x.crew]).toEqual([360, 2]); // 3h window x 2 people
      expect(x.actual_minutes).toBe(150);
      const [s] = await tx`select * from public.customers_summary()`;
      expect([Number(s.overdue_cents), Number(s.outstanding_cents)]).toEqual([8500, 8500]);
    });
  });

  it("a manager gets no money figures (cannot read invoices) but the list still works", async () => {
    await as(id.manager, async (tx) => {
      const [x] = await tx`select * from public.customer_list_extras(${[cust]})`;
      expect(Number(x.outstanding_cents)).toBe(0);
      const [s] = await tx`select * from public.customers_summary()`;
      expect(Number(s.outstanding_cents)).toBe(0);
    });
  });

  it("another company never sees these customers", async () => {
    await as(id.other, async (tx) => {
      expect(await tx`select * from public.customer_list_extras(${[cust]})`).toHaveLength(0);
      const [x] = await tx`select * from public.customer_list_extras(${[otherCust]})`;
      expect(x.job_id).toBeNull();
    });
  });

  it("rating is 1 to 5 and editable by staff", async () => {
    await as(id.owner, async (tx) => {
      await tx`update public.customers set rating = 5 where id = ${cust}`;
      await tx`savepoint s`;
      await expect(tx`update public.customers set rating = 6 where id = ${cust}`).rejects.toThrow();
      await tx`rollback to savepoint s`;
    });
  });
});
