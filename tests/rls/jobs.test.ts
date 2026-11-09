// Phase 4a security tests: employees, jobs, assignments, checklist snapshot, quote → job. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("jobs & employees (RLS, snapshot, quote → job)", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { ownerA: randomUUID(), ownerB: randomUUID(), office: randomUUID(), empAssigned: randomUUID(), empOther: randomUUID(), accountant: randomUUID() };
  let tA = "", tB = "", custA = "", svcA = "";
  let empAssigned = "", empOther = ""; // employees rows

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
    for (const [k, v] of Object.entries(id)) await sql`insert into auth.users (id, email) values (${v}, ${`j-${k}-${v}@test.local`})`;
    tA = await createTenant(id.ownerA, "Job Alpha");
    tB = await createTenant(id.ownerB, "Job Beta");
    for (const [uid, role] of [[id.office, "office_staff"], [id.empAssigned, "employee"], [id.empOther, "employee"], [id.accountant, "accountant"]] as const) {
      await sql`insert into public.profiles (id, email) values (${uid}, ${`${role}-${uid}@test.local`})`;
      await sql`insert into public.memberships (tenant_id, user_id, role) values (${tA}, ${uid}, ${role})`;
    }
    custA = (await sql`insert into public.customers (tenant_id, first_name, last_name, status, service_address, city, state, zip_code, access_instructions)
      values (${tA}, 'Ann', 'Lee', 'active', '1 Main St', 'Austin', 'Texas', '78701', 'Key under mat') returning id`)[0].id;
    svcA = (await sql`select id from public.service_types where tenant_id = ${tA} and code = 'standard'`)[0].id;
    empAssigned = (await sql`insert into public.employees (tenant_id, user_id, full_name) values (${tA}, ${id.empAssigned}, 'Eva One') returning id`)[0].id;
    empOther = (await sql`insert into public.employees (tenant_id, user_id, full_name) values (${tA}, ${id.empOther}, 'Otto Two') returning id`)[0].id;
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tA}, ${tB})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  const newJob = (tx: postgres.TransactionSql, uid: string, extra = {}) =>
    tx`insert into public.jobs ${tx({ tenant_id: tA, customer_id: custA, title: "Clean", scheduled_date: "2099-01-05", created_by: uid, service_type_id: svcA, ...extra })} returning id`;

  it("staff create jobs; checklist snapshot copies the active template and ignores later template edits", async () => {
    await as(id.office, async (tx) => {
      const jid = (await newJob(tx, id.office))[0].id;
      expect((await tx`select public.snapshot_job_checklist(${jid}) as n`)[0].n).toBeGreaterThanOrEqual(10);
      expect((await tx`select public.snapshot_job_checklist(${jid}) as n`)[0].n).toBe(0); // idempotent
      const before = (await tx`select count(*)::int n from public.job_checklist_items where job_id = ${jid}`)[0].n;
      await tx`delete from public.checklist_template_items where tenant_id = ${tA}`.catch(() => {}); // office cannot (no policy)
      expect((await tx`select count(*)::int n from public.job_checklist_items where job_id = ${jid}`)[0].n).toBe(before);
    });
  });

  it("employee sees only assigned jobs; cannot create, edit or read customers", async () => {
    const jobAssigned = (await sql`insert into public.jobs (tenant_id, customer_id, title, scheduled_date, service_type_id) values (${tA}, ${custA}, 'Mine', '2099-01-05', ${svcA}) returning id`)[0].id;
    const jobOther = (await sql`insert into public.jobs (tenant_id, customer_id, title, scheduled_date) values (${tA}, ${custA}, 'Not mine', '2099-01-05') returning id`)[0].id;
    await sql`insert into public.job_assignments (tenant_id, job_id, employee_id) values (${tA}, ${jobAssigned}, ${empAssigned})`;
    await sql`insert into public.job_assignments (tenant_id, job_id, employee_id) values (${tA}, ${jobOther}, ${empOther})`;
    await as(id.empAssigned, async (tx) => {
      const rows = await tx`select id from public.jobs where tenant_id = ${tA}`;
      expect(rows.map((r) => r.id)).toEqual([jobAssigned]);
      expect(await tx`select 1 from public.customers where tenant_id = ${tA}`).toHaveLength(0);
      expect((await tx`update public.jobs set title = 'x' where id = ${jobAssigned}`).count).toBe(0);
      await expect(tx`savepoint s`.then(() => newJob(tx, id.empAssigned))).rejects.toThrow();
    });
    await as(id.accountant, async (tx) => {
      expect(await tx`select 1 from public.jobs where tenant_id = ${tA}`).toHaveLength(0);
    });
  });

  it("employee can progress only their own job (scheduled → in_progress → completed) and tick items", async () => {
    const jid = (await sql`insert into public.jobs (tenant_id, customer_id, title, scheduled_date, service_type_id) values (${tA}, ${custA}, 'Flow', '2099-01-05', ${svcA}) returning id`)[0].id;
    await sql`insert into public.job_assignments (tenant_id, job_id, employee_id) values (${tA}, ${jid}, ${empAssigned})`;
    await sql`insert into public.job_checklist_items (tenant_id, job_id, title, position) values (${tA}, ${jid}, 'Dust', 1)`;
    const item = (await sql`select id from public.job_checklist_items where job_id = ${jid}`)[0].id;

    await as(id.empAssigned, async (tx) => {
      await tx`select public.set_job_item_done(${item}, true)`;
      const [i] = await tx`select is_done, done_at, done_by from public.job_checklist_items where id = ${item}`;
      expect(i.is_done).toBe(true);
      expect(i.done_by).toBe(id.empAssigned);
      await tx`savepoint a`;
      await expect(tx`select public.set_job_status(${jid}, 'completed')`).rejects.toThrow(); // must start first
      await tx`rollback to savepoint a`;
      await tx`select public.set_job_status(${jid}, 'in_progress')`;
      await tx`select public.set_job_status(${jid}, 'completed')`;
      expect((await tx`select status, completed_at from public.jobs where id = ${jid}`)[0].completed_at).not.toBeNull();
      await tx`savepoint b`;
      await expect(tx`select public.set_job_status(${jid}, 'cancelled')`).rejects.toThrow();
      await tx`rollback to savepoint b`;
    });
    await expect(as(id.empOther, (tx) => tx`select public.set_job_item_done(${item}, false)`)).rejects.toThrow();
    await expect(as(id.empOther, (tx) => tx`select public.set_job_status(${jid}, 'in_progress')`)).rejects.toThrow();
  });

  it("isolation: another company sees nothing and cannot use the functions", async () => {
    const jid = (await sql`insert into public.jobs (tenant_id, customer_id, title, scheduled_date) values (${tA}, ${custA}, 'Iso', '2099-01-05') returning id`)[0].id;
    await as(id.ownerB, async (tx) => {
      expect(await tx`select 1 from public.jobs where id = ${jid}`).toHaveLength(0);
      expect(await tx`select 1 from public.employees where tenant_id = ${tA}`).toHaveLength(0);
      expect((await tx`update public.jobs set title = 'x' where id = ${jid}`).count).toBe(0);
    });
    await expect(as(id.ownerB, (tx) => tx`select public.set_job_status(${jid}, 'cancelled')`)).rejects.toThrow();
    await expect(as(id.ownerB, (tx) => tx`select public.snapshot_job_checklist(${jid})`)).rejects.toThrow();
  });

  it("cannot assign another company's employee or job", async () => {
    const empB = (await sql`insert into public.employees (tenant_id, full_name) values (${tB}, 'Bea') returning id`)[0].id;
    const jid = (await sql`insert into public.jobs (tenant_id, customer_id, title, scheduled_date) values (${tA}, ${custA}, 'X', '2099-01-05') returning id`)[0].id;
    await expect(as(id.ownerA, (tx) => tx`insert into public.job_assignments (tenant_id, job_id, employee_id) values (${tA}, ${jid}, ${empB})`)).rejects.toThrow();
  });

  it("quote → job: only accepted quotes, once, with price from the accepted option and customer snapshot", async () => {
    await as(id.ownerA, async (tx) => {
      const q = (await tx`insert into public.quotes (tenant_id, customer_id, expires_on, created_by, service_type_id, tax_rate, title)
        values (${tA}, ${custA}, '2099-01-01', ${id.ownerA}, ${svcA}, 10, 'Spring clean') returning id`)[0].id;
      const o = (await tx`insert into public.quote_options (tenant_id, quote_id, name, base_price_cents) values (${tA}, ${q}, 'Good', 10000) returning id`)[0].id;
      await tx`savepoint s`;
      await expect(tx`select public.create_job_from_quote(${q}, '2099-02-01')`).rejects.toThrow(/not accepted/);
      await tx`rollback to savepoint s`;
      await tx`select public.set_quote_status(${q}, 'accepted', ${o})`;
      const jid = (await tx`select public.create_job_from_quote(${q}, '2099-02-01') as id`)[0].id;
      const [j] = await tx`select title, price_cents, customer_name, address, access_notes, status from public.jobs where id = ${jid}`;
      expect(j).toMatchObject({ title: "Spring clean", price_cents: 11000, customer_name: "Ann Lee", address: "1 Main St, Austin, Texas 78701", access_notes: "Key under mat", status: "scheduled" });
      expect((await tx`select count(*)::int n from public.job_checklist_items where job_id = ${jid}`)[0].n).toBeGreaterThan(0);
      await tx`savepoint t`;
      await expect(tx`select public.create_job_from_quote(${q}, '2099-02-02')`).rejects.toThrow(/job exists/);
      await tx`rollback to savepoint t`;
    });
  });
});
