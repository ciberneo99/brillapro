// Phase 4b tests: recurring schedules generate jobs idempotently, safely and only for the right roles. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("recurring schedules", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { ownerA: randomUUID(), ownerB: randomUUID(), employee: randomUUID() };
  let tA = "", custA = "", svcA = "", emp = "";

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

  let tB = "";
  beforeAll(async () => {
    for (const [k, v] of Object.entries(id)) await sql`insert into auth.users (id, email) values (${v}, ${`r-${k}-${v}@test.local`})`;
    tA = await createTenant(id.ownerA, "Rec Alpha");
    tB = await createTenant(id.ownerB, "Rec Beta");
    await sql`insert into public.profiles (id, email) values (${id.employee}, ${`emp-${id.employee}@test.local`})`;
    await sql`insert into public.memberships (tenant_id, user_id, role) values (${tA}, ${id.employee}, 'employee')`;
    custA = (await sql`insert into public.customers (tenant_id, first_name, last_name, status) values (${tA}, 'Ann', 'Lee', 'active') returning id`)[0].id;
    svcA = (await sql`select id from public.service_types where tenant_id = ${tA} and code = 'standard'`)[0].id;
    emp = (await sql`insert into public.employees (tenant_id, full_name) values (${tA}, 'Eva') returning id`)[0].id;
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tA}, ${tB})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  const newSchedule = (tx: postgres.TransactionSql, extra = {}) =>
    tx`insert into public.recurring_schedules ${tx({
      tenant_id: tA, customer_id: custA, service_type_id: svcA, title: "Weekly", frequency: "weekly",
      start_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), created_by: id.ownerA, ...extra,
    })} returning id`;
  const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  it("occurrence math: weekly, biweekly, four-weekly and month-end clamping", async () => {
    const [r] = await sql`select
      public.recurring_nth('2099-01-31', 'monthly', 1)::text m1, public.recurring_nth('2099-01-31', 'monthly', 2)::text m2,
      public.recurring_nth('2099-01-01', 'weekly', 2)::text w, public.recurring_nth('2099-01-01', 'biweekly', 1)::text b,
      public.recurring_nth('2099-01-01', 'every_four_weeks', 1)::text f`;
    expect(r).toMatchObject({ m1: "2099-02-28", m2: "2099-03-31", w: "2099-01-15", b: "2099-01-15", f: "2099-01-29" });
  });

  it("generates jobs with assignments and checklist, idempotently, and never back-fills the past", async () => {
    await as(id.ownerA, async (tx) => {
      const sid = (await newSchedule(tx, { start_date: plusDays(-14), price_cents: 9000 }))[0].id;
      await tx`insert into public.recurring_schedule_employees (tenant_id, schedule_id, employee_id) values (${tA}, ${sid}, ${emp})`;
      const n = (await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(30)}::date) as n`)[0].n;
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(5);
      const jobs = await tx`select scheduled_date::text d, price_cents, customer_name from public.jobs where recurring_schedule_id = ${sid} order by 1`;
      expect(jobs).toHaveLength(n);
      expect(jobs[0].d >= plusDays(0)).toBe(true);
      expect(jobs[0]).toMatchObject({ price_cents: 9000, customer_name: "Ann Lee" });
      expect((await tx`select count(*)::int c from public.job_assignments where employee_id = ${emp}`)[0].c).toBe(n);
      expect((await tx`select count(distinct job_id)::int c from public.job_checklist_items i join public.jobs j on j.id = i.job_id where j.recurring_schedule_id = ${sid}`)[0].c).toBe(n);
      expect((await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(30)}::date) as n`)[0].n).toBe(0);
      expect((await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(44)}::date) as n`)[0].n).toBeGreaterThan(0);
    });
  });

  it("respects the end date; ending a schedule cancels future scheduled jobs only on request", async () => {
    await as(id.ownerA, async (tx) => {
      const sid = (await newSchedule(tx, { until_date: plusDays(15) }))[0].id;
      const n = (await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(100)}::date) as n`)[0].n;
      expect(n).toBeLessThanOrEqual(3);
      const first = (await tx`select id from public.jobs where recurring_schedule_id = ${sid} order by scheduled_date limit 1`)[0].id;
      await tx`select public.set_job_status(${first}, 'in_progress')`;
      const cancelled = (await tx`select public.end_recurring(${sid}, true) as n`)[0].n;
      expect(cancelled).toBe(n - 1); // the started one is kept
      expect((await tx`select is_active from public.recurring_schedules where id = ${sid}`)[0].is_active).toBe(false);
      expect((await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(100)}::date) as n`)[0].n).toBe(0);
    });
  });

  it("a cancelled occurrence is not recreated by a later generation", async () => {
    await as(id.ownerA, async (tx) => {
      const sid = (await newSchedule(tx))[0].id;
      await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(10)}::date)`;
      const j = (await tx`select id from public.jobs where recurring_schedule_id = ${sid} order by scheduled_date limit 1`)[0].id;
      await tx`select public.set_job_status(${j}, 'cancelled')`;
      expect((await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(10)}::date) as n`)[0].n).toBe(0);
    });
  });

  it("roles and isolation: employees and other companies get nothing", async () => {
    const sid = (await sql`insert into public.recurring_schedules (tenant_id, customer_id, title, frequency, start_date)
      values (${tA}, ${custA}, 'Hidden', 'weekly', current_date + 1) returning id`)[0].id;
    for (const u of [id.employee, id.ownerB]) {
      await as(u, async (tx) => expect(await tx`select 1 from public.recurring_schedules where id = ${sid}`).toHaveLength(0));
      await expect(as(u, (tx) => tx`select public.generate_recurring_jobs(${sid}, current_date + 10)`)).rejects.toThrow();
      await expect(as(u, (tx) => tx`select public.end_recurring(${sid}, true)`)).rejects.toThrow();
    }
    await expect(as(id.ownerB, (tx) => tx`insert into public.recurring_schedules (tenant_id, customer_id, title, frequency, start_date, created_by)
      values (${tA}, ${custA}, 'x', 'weekly', current_date, ${id.ownerB})`)).rejects.toThrow();
    // frequency / start date cannot be edited afterwards
    await expect(as(id.ownerA, (tx) => tx`update public.recurring_schedules set frequency = 'monthly' where id = ${sid}`)).rejects.toThrow();
  });
});
