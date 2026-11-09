// Phase 4c tests: time tracking, private notes, tasks. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("time entries, notes, tasks", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { ownerA: randomUUID(), ownerB: randomUUID(), emp1: randomUUID(), emp2: randomUUID(), office: randomUUID(), accountant: randomUUID() };
  let tA = "", tB = "", custA = "", e1 = "", e2 = "", jobMine = "", jobOther = "";

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
    for (const [k, v] of Object.entries(id)) await sql`insert into auth.users (id, email) values (${v}, ${`n-${k}-${v}@test.local`})`;
    tA = await createTenant(id.ownerA, "Note Alpha");
    tB = await createTenant(id.ownerB, "Note Beta");
    for (const [uid, role] of [[id.emp1, "employee"], [id.emp2, "employee"], [id.office, "office_staff"], [id.accountant, "accountant"]] as const) {
      await sql`insert into public.profiles (id, email) values (${uid}, ${`${role}-${uid}@test.local`})`;
      await sql`insert into public.memberships (tenant_id, user_id, role) values (${tA}, ${uid}, ${role})`;
    }
    custA = (await sql`insert into public.customers (tenant_id, first_name, status) values (${tA}, 'Ann', 'active') returning id`)[0].id;
    e1 = (await sql`insert into public.employees (tenant_id, user_id, full_name) values (${tA}, ${id.emp1}, 'One') returning id`)[0].id;
    e2 = (await sql`insert into public.employees (tenant_id, user_id, full_name) values (${tA}, ${id.emp2}, 'Two') returning id`)[0].id;
    jobMine = (await sql`insert into public.jobs (tenant_id, customer_id, title, scheduled_date) values (${tA}, ${custA}, 'Mine', '2099-01-01') returning id`)[0].id;
    jobOther = (await sql`insert into public.jobs (tenant_id, customer_id, title, scheduled_date) values (${tA}, ${custA}, 'Other', '2099-01-01') returning id`)[0].id;
    await sql`insert into public.job_assignments (tenant_id, job_id, employee_id) values (${tA}, ${jobMine}, ${e1}), (${tA}, ${jobOther}, ${e2})`;
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tA}, ${tB})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  it("clock in/out: own assigned job only, one open entry at a time", async () => {
    await as(id.emp1, async (tx) => {
      await tx`savepoint a`;
      await expect(tx`select public.clock_in(${tA}, ${jobOther})`).rejects.toThrow(/not assigned/);
      await tx`rollback to savepoint a`;
      await tx`savepoint b`;
      await expect(tx`select public.clock_out(${tA})`).rejects.toThrow(/not clocked in/);
      await tx`rollback to savepoint b`;
      await tx`select public.clock_in(${tA}, ${jobMine})`;
      await tx`savepoint c`;
      await expect(tx`select public.clock_in(${tA})`).rejects.toThrow(); // already open
      await tx`rollback to savepoint c`;
      await tx`select public.clock_out(${tA})`;
      const [r] = await tx`select clock_out > clock_in as ok, employee_id from public.time_entries`;
      expect(r).toMatchObject({ ok: true, employee_id: e1 });
    });
  });

  it("employees see only their own time; cannot write time directly; accountant sees none", async () => {
    await sql`insert into public.time_entries (tenant_id, employee_id, clock_in, clock_out) values
      (${tA}, ${e1}, now() - interval '3 hours', now() - interval '2 hours'), (${tA}, ${e2}, now() - interval '3 hours', now() - interval '1 hour')`;
    await as(id.emp1, async (tx) => {
      expect((await tx`select employee_id from public.time_entries`).every((r) => r.employee_id === e1)).toBe(true);
      await expect(tx`insert into public.time_entries (tenant_id, employee_id, clock_in, created_by) values (${tA}, ${e1}, now(), ${id.emp1})`).rejects.toThrow();
    });
    await as(id.emp1, async (tx) => expect((await tx`update public.time_entries set clock_out = now()`).count).toBe(0));
    await as(id.office, async (tx) => expect((await tx`select 1 from public.time_entries`).length).toBeGreaterThanOrEqual(2)); // office can read
    await as(id.accountant, async (tx) => expect(await tx`select 1 from public.time_entries`).toHaveLength(0));
    await as(id.ownerB, async (tx) => expect(await tx`select 1 from public.time_entries where tenant_id = ${tA}`).toHaveLength(0));
  });

  it("a user without an employee record cannot clock in; manager manual entry uses company time zone", async () => {
    await expect(as(id.office, (tx) => tx`select public.clock_in(${tA})`)).rejects.toThrow();
    await expect(as(id.office, (tx) => tx`select public.add_time_entry(${e1}, null, '2099-03-01', '09:00', '11:00', 'x')`)).rejects.toThrow(); // office cannot
    await as(id.ownerA, async (tx) => {
      await tx`update public.tenant_settings set timezone = 'America/Chicago' where tenant_id = ${tA}`;
      const eid = (await tx`select public.add_time_entry(${e1}, ${jobMine}, '2099-03-01', '09:00', '11:30', ' fix ') as id`)[0].id;
      const [r] = await tx`select to_char(clock_in at time zone 'America/Chicago', 'HH24:MI') as li, extract(epoch from clock_out - clock_in)/3600 as h, notes from public.time_entries where id = ${eid}`;
      expect(Number(r.h)).toBe(2.5);
      expect(r.notes).toBe("fix");
      expect(r.li).toBe("09:00");
      await tx`savepoint s`;
      await expect(tx`select public.add_time_entry(${e1}, null, '2099-03-01', '11:00', '09:00', null)`).rejects.toThrow();
      await tx`rollback to savepoint s`;
    });
  });

  it("notes are private to their author — even the owner cannot read them", async () => {
    await sql`insert into public.user_notes (tenant_id, user_id, title, body) values (${tA}, ${id.emp1}, 'Secret', 'x')`;
    await as(id.ownerA, async (tx) => expect(await tx`select 1 from public.user_notes`).toHaveLength(0));
    await as(id.emp2, async (tx) => expect(await tx`select 1 from public.user_notes`).toHaveLength(0));
    await as(id.emp1, async (tx) => {
      expect(await tx`select 1 from public.user_notes`).toHaveLength(1);
      await tx`insert into public.user_notes (tenant_id, user_id, title) values (${tA}, ${id.emp1}, 'Mine')`;
      await expect(tx`insert into public.user_notes (tenant_id, user_id, title) values (${tA}, ${id.emp2}, 'Forged')`).rejects.toThrow();
    });
    await as(id.accountant, async (tx) => {
      await expect(tx`insert into public.user_notes (tenant_id, user_id, title) values (${tA}, ${id.accountant}, 'No')`).rejects.toThrow();
    });
  });

  it("tasks: employees see theirs; staff see all; assignee must be a company member; done via function", async () => {
    const t1 = (await sql`insert into public.tasks (tenant_id, title, assigned_to, created_by) values (${tA}, 'For emp1', ${id.emp1}, ${id.ownerA}) returning id`)[0].id;
    const t2 = (await sql`insert into public.tasks (tenant_id, title, assigned_to, created_by) values (${tA}, 'For emp2', ${id.emp2}, ${id.ownerA}) returning id`)[0].id;
    await as(id.emp1, async (tx) => {
      expect((await tx`select id from public.tasks`).map((r) => r.id)).toEqual([t1]);
      await tx`select public.set_task_done(${t1}, true)`;
      expect((await tx`select is_done, completed_at from public.tasks where id = ${t1}`)[0].is_done).toBe(true);
      await tx`savepoint s`;
      await expect(tx`select public.set_task_done(${t2}, true)`).rejects.toThrow();
      await tx`rollback to savepoint s`;
      expect((await tx`update public.tasks set title = 'hack' where id = ${t1}`).count).toBe(0); // assignee cannot edit
    });
    await as(id.office, async (tx) => expect(await tx`select 1 from public.tasks`).toHaveLength(2));
    await as(id.ownerB, async (tx) => expect(await tx`select 1 from public.tasks where tenant_id = ${tA}`).toHaveLength(0));
    await expect(as(id.ownerA, (tx) => tx`insert into public.tasks (tenant_id, title, assigned_to, created_by) values (${tA}, 'x', ${id.ownerB}, ${id.ownerA})`)).rejects.toThrow();
    await expect(as(id.accountant, (tx) => tx`insert into public.tasks (tenant_id, title, created_by) values (${tA}, 'x', ${id.accountant})`)).rejects.toThrow();
  });
});
