// Phase 6 tests: inventory and report functions. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("inventory and reports", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { ownerA: randomUUID(), ownerB: randomUUID(), manager: randomUUID(), office: randomUUID(), accountant: randomUUID(), employee: randomUUID() };
  let tA = "", tB = "", itemA = "", itemB = "";

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
    for (const [k, v] of Object.entries(id)) await sql`insert into auth.users (id, email) values (${v}, ${`x-${k}-${v}@test.local`})`;
    tA = await createTenant(id.ownerA, "Inv Alpha");
    tB = await createTenant(id.ownerB, "Inv Beta");
    for (const [uid, role] of [[id.manager, "manager"], [id.office, "office_staff"], [id.accountant, "accountant"], [id.employee, "employee"]] as const) {
      await sql`insert into public.profiles (id, email) values (${uid}, ${`${role}-${uid}@test.local`})`;
      await sql`insert into public.memberships (tenant_id, user_id, role) values (${tA}, ${uid}, ${role})`;
    }
    itemA = (await sql`insert into public.inventory_items (tenant_id, name, unit, min_quantity) values (${tA}, 'Glass cleaner', 'bottle', 5) returning id`)[0].id;
    itemB = (await sql`insert into public.inventory_items (tenant_id, name) values (${tB}, 'Other') returning id`)[0].id;
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tA}, ${tB})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  const move = (tx: postgres.TransactionSql, uid: string, kind: string, quantity: number, extra = {}) =>
    tx`insert into public.inventory_movements ${tx({ tenant_id: tA, item_id: itemA, kind, quantity, created_by: uid, ...extra })}`;

  it("stock follows movements, low-stock flag works, and it can't go negative", async () => {
    await as(id.manager, async (tx) => {
      await move(tx, id.manager, "purchase", 10);
      await move(tx, id.manager, "use", -6);
      const o = (await tx`select on_hand, is_low from public.inventory_overview where id = ${itemA}`)[0];
      expect([Number(o.on_hand), o.is_low]).toEqual([4, true]);
      await tx`savepoint s`;
      await expect(move(tx, id.manager, "use", -5)).rejects.toThrow();
      await tx`rollback to savepoint s`;
      await tx`savepoint s2`;
      await expect(move(tx, id.manager, "adjustment", -4.5)).rejects.toThrow();
      await tx`rollback to savepoint s2`;
      await move(tx, id.manager, "adjustment", -4);
      expect(Number((await tx`select on_hand from public.inventory_overview where id = ${itemA}`)[0].on_hand)).toBe(0);
    });
  });

  it("movement signs are enforced", async () => {
    await as(id.ownerA, async (tx) => {
      for (const [kind, q] of [["purchase", -1], ["use", 1], ["adjustment", 0], ["purchase", 0]] as const) {
        await tx`savepoint s`;
        await expect(move(tx, id.ownerA, kind, q)).rejects.toThrow();
        await tx`rollback to savepoint s`;
      }
    });
  });

  it("only owner/admin/manager can see or change inventory; other companies see nothing", async () => {
    await sql`insert into public.inventory_movements (tenant_id, item_id, kind, quantity) values (${tA}, ${itemA}, 'purchase', 3)`;
    for (const u of [id.office, id.accountant, id.employee, id.ownerB]) {
      await as(u, async (tx) => {
        expect(await tx`select 1 from public.inventory_items where tenant_id = ${tA}`).toHaveLength(0);
        expect(await tx`select 1 from public.inventory_movements where tenant_id = ${tA}`).toHaveLength(0);
        await tx`savepoint s`;
        await expect(move(tx, u, "purchase", 1)).rejects.toThrow();
        await tx`rollback to savepoint s`;
      });
    }
    await as(id.ownerA, async (tx) => expect(await tx`select 1 from public.inventory_items where tenant_id = ${tA}`).toHaveLength(1));
  });

  it("history is permanent, items are never deleted, no forged creator, no cross-company item", async () => {
    await as(id.ownerA, async (tx) => {
      await move(tx, id.ownerA, "purchase", 2);
      await tx`savepoint a`;
      await expect(tx`update public.inventory_movements set quantity = 99 where tenant_id = ${tA}`).rejects.toThrow();
      await tx`rollback to savepoint a`;
      await tx`savepoint b`;
      await expect(tx`delete from public.inventory_movements where tenant_id = ${tA}`).rejects.toThrow();
      await tx`rollback to savepoint b`;
      await tx`savepoint c`;
      await expect(tx`delete from public.inventory_items where tenant_id = ${tA}`).rejects.toThrow();
      await tx`rollback to savepoint c`;
      await tx`savepoint d`;
      await expect(move(tx, randomUUID(), "purchase", 1)).rejects.toThrow();
      await tx`rollback to savepoint d`;
      await tx`savepoint e`;
      await expect(move(tx, id.ownerA, "purchase", 1, { item_id: itemB })).rejects.toThrow();
      await tx`rollback to savepoint e`;
      expect((await tx`update public.inventory_items set is_active = false where id = ${itemA}`).count).toBe(1);
    });
  });

  it("report functions respect roles: manager sees jobs, accountant sees money, nobody sees another company", async () => {
    const cust = (await sql`insert into public.customers (tenant_id, first_name) values (${tA}, 'Rep') returning id`)[0].id;
    await sql`insert into public.jobs (tenant_id, customer_id, title, scheduled_date, price_cents, status) values (${tA}, ${cust}, 'J1', '2026-05-10', 10000, 'completed')`;
    const cat = (await sql`select id from public.bank_categories where tenant_id = ${tA} and parent_id is not null limit 1`)[0].id;
    await sql`insert into public.expenses (tenant_id, category_id, amount_cents, expense_date) values (${tA}, ${cat}, 2500, '2026-05-11')`;
    await as(id.manager, async (tx) => {
      const r = await tx`select * from public.report_jobs('2026-05-01', '2026-05-31')`;
      expect(r.map((x) => [x.status, Number(x.jobs), Number(x.revenue_cents)])).toEqual([["completed", 1, 10000]]);
      const m = (await tx`select * from public.report_money('2026-05-01', '2026-05-31')`)[0];
      expect(Number(m.expenses_cents)).toBe(0); // managers can't read expenses
    });
    await as(id.accountant, async (tx) => {
      const m = (await tx`select * from public.report_money('2026-05-01', '2026-05-31')`)[0];
      expect(Number(m.expenses_cents)).toBe(2500);
    });
    await as(id.ownerB, async (tx) => {
      expect(await tx`select * from public.report_jobs('2026-05-01', '2026-05-31')`).toHaveLength(0);
      expect(Number((await tx`select * from public.report_money('2026-05-01', '2026-05-31')`)[0].expenses_cents)).toBe(0);
    });
  });

  it("hours report sums closed entries per employee", async () => {
    const emp = (await sql`insert into public.employees (tenant_id, full_name) values (${tA}, 'Ana') returning id`)[0].id;
    await sql`insert into public.time_entries (tenant_id, employee_id, clock_in, clock_out) values (${tA}, ${emp}, '2026-05-12T14:00:00Z', '2026-05-12T17:30:00Z')`;
    await sql`insert into public.time_entries (tenant_id, employee_id, clock_in) values (${tA}, ${emp}, '2026-05-13T14:00:00Z')`; // still open: ignored
    await as(id.manager, async (tx) => {
      const r = await tx`select * from public.report_hours('2026-05-01', '2026-05-31')`;
      expect(r).toHaveLength(1);
      expect([r[0].employee_name, Number(r[0].seconds), Number(r[0].entries)]).toEqual(["Ana", 12600, 1]);
    });
  });
});
