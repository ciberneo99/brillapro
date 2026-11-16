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

  it("delete_jobs: one occurrence is erased and stays skipped when the series is extended", async () => {
    await as(id.ownerA, async (tx) => {
      const sid = (await newSchedule(tx))[0].id;
      await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(20)}::date)`;
      const before = (await tx`select count(*)::int c from public.jobs where recurring_schedule_id = ${sid}`)[0].c;
      const j = (await tx`select id from public.jobs where recurring_schedule_id = ${sid} order by scheduled_date limit 1`)[0].id;
      expect((await tx`select * from public.delete_jobs(${j}, 'one')`)[0]).toMatchObject({ deleted: 1, cancelled: 0 });
      expect((await tx`select count(*)::int c from public.jobs where recurring_schedule_id = ${sid}`)[0].c).toBe(before - 1);
      expect((await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(20)}::date) as n`)[0].n).toBe(0);
    });
  });

  it("delete_jobs: following keeps earlier and started jobs; series erases the rest and ends the schedule", async () => {
    await as(id.ownerA, async (tx) => {
      const sid = (await newSchedule(tx))[0].id;
      await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(30)}::date)`;
      const ids = (await tx`select id from public.jobs where recurring_schedule_id = ${sid} order by scheduled_date`).map((r) => r.id as string);
      expect(ids.length).toBeGreaterThanOrEqual(4);
      await tx`select public.set_job_status(${ids[2]}, 'in_progress')`;
      const r = (await tx`select * from public.delete_jobs(${ids[1]}, 'following')`)[0];
      expect(r.cancelled).toBe(0);
      expect(r.deleted).toBe(ids.length - 2); // all but the first and the started one
      expect((await tx`select count(*)::int c from public.jobs where recurring_schedule_id = ${sid}`)[0].c).toBe(2);
      await expect(tx`select * from public.delete_jobs(${ids[2]}, 'one')`).rejects.toThrow(/started/);
    });
    await as(id.ownerA, async (tx) => {
      const sid = (await newSchedule(tx))[0].id;
      await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(20)}::date)`;
      const n = (await tx`select count(*)::int c from public.jobs where recurring_schedule_id = ${sid}`)[0].c;
      expect((await tx`select * from public.delete_series(${sid})`)[0]).toMatchObject({ deleted: n, cancelled: 0 });
      expect((await tx`select count(*)::int c from public.jobs where recurring_schedule_id = ${sid}`)[0].c).toBe(0);
      expect((await tx`select is_active from public.recurring_schedules where id = ${sid}`)[0].is_active).toBe(false);
    });
  });

  it("delete_jobs: a job with hours logged is cancelled, not erased; outsiders cannot delete", async () => {
    await as(id.ownerA, async (tx) => {
      const sid = (await newSchedule(tx))[0].id;
      await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(10)}::date)`;
      const j = (await tx`select id from public.jobs where recurring_schedule_id = ${sid} order by scheduled_date limit 1`)[0].id;
      await tx`reset role`;
      await tx`insert into public.time_entries (tenant_id, employee_id, job_id, clock_in) values (${tA}, ${emp}, ${j}, now())`;
      await tx`set local role authenticated`;
      expect((await tx`select * from public.delete_jobs(${j}, 'one')`)[0]).toMatchObject({ deleted: 0, cancelled: 1 });
      expect((await tx`select status from public.jobs where id = ${j}`)[0].status).toBe("cancelled");
    });
    const j2 = (await sql`insert into public.jobs (tenant_id, customer_id, title, scheduled_date, customer_name) values (${tA}, ${custA}, 'Solo', current_date + 3, 'Ann Lee') returning id`)[0].id;
    for (const u of [id.employee, id.ownerB]) {
      await expect(as(u, (tx) => tx`select * from public.delete_jobs(${j2}, 'one')`)).rejects.toThrow();
    }
  });

  describe("update_series_from (this and following)", () => {
    const upd = (tx: postgres.TransactionSql, job: string, freq: string | null, date: string, extra: Record<string, unknown> = {}) =>
      tx`select public.update_series_from(${job}, ${freq}, ${(extra.title as string) ?? "Weekly"}, ${svcA}, ${date}::date, ${(extra.start as string) ?? null}::time, ${(extra.end as string) ?? null}::time,
        ${null}, ${null}, ${(extra.price as number) ?? 0}, ${null}) as n`;
    const dates = async (tx: postgres.TransactionSql, sid: string) =>
      (await tx`select scheduled_date::text d from public.jobs where recurring_schedule_id = ${sid} order by 1`).map((r) => r.d as string);

    it("changes the cadence from a job onward and keeps earlier jobs, ids and count", async () => {
      await as(id.ownerA, async (tx) => {
        const sid = (await newSchedule(tx))[0].id;
        await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(30)}::date)`;
        const before = await tx`select id, scheduled_date::text d from public.jobs where recurring_schedule_id = ${sid} order by scheduled_date`;
        expect(before.length).toBeGreaterThanOrEqual(4);
        const newDate = plusDays(Number((new Date(before[1].d).getTime() - Date.now()) / 86400000) + 3 | 0);
        const n = (await upd(tx, before[1].id, "biweekly", newDate))[0].n;
        expect(n).toBe(before.length - 1);
        const after = await dates(tx, sid);
        expect(after).toHaveLength(before.length);
        expect(after[0]).toBe(before[0].d); // the earlier job is untouched
        const moved = after.slice(1);
        expect(moved[0]).toBe(newDate);
        for (let i = 1; i < moved.length; i++) expect((new Date(moved[i]).getTime() - new Date(moved[i - 1]).getTime()) / 86400000).toBe(14);
        const sch = (await tx`select frequency, start_date::text sd from public.recurring_schedules where id = ${sid}`)[0];
        expect(sch).toMatchObject({ frequency: "biweekly", sd: newDate });
        // ids are kept (jobs were moved, not recreated)
        expect((await tx`select count(*)::int c from public.jobs where id in ${tx(before.map((b) => b.id))}`)[0].c).toBe(before.length);
        // extending later follows the new cadence and does not recreate old dates
        await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(120)}::date)`;
        const ext = await dates(tx, sid);
        expect(ext.length).toBeGreaterThan(before.length);
        expect(new Set(ext).size).toBe(ext.length);
      });
    });

    it("only edits fields when date and frequency are unchanged, so jobs moved one by one stay where they are", async () => {
      await as(id.ownerA, async (tx) => {
        const sid = (await newSchedule(tx))[0].id;
        await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(30)}::date)`;
        const js = await tx`select id, scheduled_date::text d from public.jobs where recurring_schedule_id = ${sid} order by scheduled_date`;
        const solo = plusDays(Number((new Date(js[2].d).getTime() - Date.now()) / 86400000) + 2 | 0);
        await tx`update public.jobs set scheduled_date = ${solo} where id = ${js[2].id}`;
        await upd(tx, js[1].id, null, js[1].d, { price: 12300, start: "09:00", end: "11:00" });
        const rows = await tx`select scheduled_date::text d, price_cents p, start_time::text st from public.jobs where recurring_schedule_id = ${sid} order by scheduled_date`;
        expect(rows.map((r) => r.d)).toContain(solo);
        expect(rows[0].p).toBe(0); // before the chosen job: untouched
        for (const r of rows.slice(1)) expect([r.p, r.st]).toEqual([12300, "09:00:00"]);
      });
    });

    it("refuses started jobs, taken dates, ended series and outsiders", async () => {
      await as(id.ownerA, async (tx) => {
        const sid = (await newSchedule(tx))[0].id;
        await tx`select public.generate_recurring_jobs(${sid}, ${plusDays(30)}::date)`;
        const js = await tx`select id, scheduled_date::text d from public.jobs where recurring_schedule_id = ${sid} order by scheduled_date`;
        await tx`savepoint a`;
        await expect(upd(tx, js[1].id, "biweekly", js[0].d)).rejects.toThrow(/date taken/);
        await tx`rollback to savepoint a`;
        await tx`select public.set_job_status(${js[1].id}, 'in_progress')`;
        await tx`savepoint b`;
        await expect(upd(tx, js[1].id, "biweekly", plusDays(40))).rejects.toThrow(/already started/);
        await tx`rollback to savepoint b`;
        await tx`select public.end_recurring(${sid}, false)`;
        await expect(upd(tx, js[2].id, "biweekly", plusDays(40))).rejects.toThrow(/ended/);
      });
      const sid2 = (await sql`insert into public.recurring_schedules (tenant_id, customer_id, title, frequency, start_date) values (${tA}, ${custA}, 'Hidden2', 'weekly', current_date + 1) returning id`)[0].id;
      const j2 = (await sql`insert into public.jobs (tenant_id, customer_id, title, scheduled_date, customer_name, recurring_schedule_id) values (${tA}, ${custA}, 'H', current_date + 1, 'Ann Lee', ${sid2}) returning id`)[0].id;
      for (const u of [id.employee, id.ownerB]) {
        await expect(as(u, (tx) => upd(tx, j2, "biweekly", plusDays(5)))).rejects.toThrow();
      }
    });
  });
});
