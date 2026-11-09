// Phase 5b tests: expenses and categories. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("expenses", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { ownerA: randomUUID(), ownerB: randomUUID(), office: randomUUID(), accountant: randomUUID(), manager: randomUUID(), employee: randomUUID() };
  let tA = "", tB = "", catA = "", catB = "";

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

  async function createTenant(uid: string, name: string, locale: string): Promise<string> {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      await tx`select public.create_tenant(${name}, ${locale})`;
    });
    return (await sql`select tenant_id from public.memberships where user_id = ${uid}`)[0].tenant_id;
  }

  beforeAll(async () => {
    for (const [k, v] of Object.entries(id)) await sql`insert into auth.users (id, email) values (${v}, ${`x-${k}-${v}@test.local`})`;
    tA = await createTenant(id.ownerA, "Exp Alpha", "es");
    tB = await createTenant(id.ownerB, "Exp Beta", "en");
    for (const [uid, role] of [[id.office, "office_staff"], [id.accountant, "accountant"], [id.manager, "manager"], [id.employee, "employee"]] as const) {
      await sql`insert into public.profiles (id, email) values (${uid}, ${`${role}-${uid}@test.local`})`;
      await sql`insert into public.memberships (tenant_id, user_id, role) values (${tA}, ${uid}, ${role})`;
    }
    catA = (await sql`select id from public.expense_categories where tenant_id = ${tA} order by sort_order limit 1`)[0].id;
    catB = (await sql`select id from public.expense_categories where tenant_id = ${tB} order by sort_order limit 1`)[0].id;
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tA}, ${tB})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  const newExpense = (tx: postgres.TransactionSql, uid: string, extra = {}) =>
    tx`insert into public.expenses ${tx({ tenant_id: tA, category_id: catA, amount_cents: 2500, expense_date: "2026-05-10", created_by: uid, ...extra })} returning id`;

  it("new companies get default categories in their language", async () => {
    const es = await sql`select name from public.expense_categories where tenant_id = ${tA} order by sort_order`;
    expect(es).toHaveLength(8);
    expect(es[0].name).toBe("Insumos de limpieza");
    expect((await sql`select name from public.expense_categories where tenant_id = ${tB} order by sort_order limit 1`)[0].name).toBe("Cleaning supplies");
  });

  it("office staff record expenses; accountant reads; summary groups by category", async () => {
    await as(id.office, async (tx) => {
      await newExpense(tx, id.office, { amount_cents: 2500 });
      await newExpense(tx, id.office, { amount_cents: 1500 });
      await newExpense(tx, id.office, { amount_cents: 9999, expense_date: "2026-06-01" });
      const rows = await tx`select * from public.expense_summary('2026-05-01', '2026-05-31')`;
      expect(rows).toHaveLength(1);
      expect([Number(rows[0].total_cents), Number(rows[0].entries)]).toEqual([4000, 2]);
    });
    await as(id.accountant, async (tx) => {
      await expect(tx`savepoint s`.then(() => newExpense(tx, id.accountant))).rejects.toThrow();
    });
  });

  it("roles and isolation: manager/employee/other company see nothing; no cross-company category; no forged creator", async () => {
    const eid = (await sql`insert into public.expenses (tenant_id, category_id, amount_cents, expense_date) values (${tA}, ${catA}, 100, '2026-05-01') returning id`)[0].id;
    for (const u of [id.manager, id.employee, id.ownerB]) {
      await as(u, async (tx) => {
        expect(await tx`select 1 from public.expenses where id = ${eid}`).toHaveLength(0);
        expect(await tx`select 1 from public.expense_categories where tenant_id = ${tA}`).toHaveLength(0);
      });
    }
    await as(id.accountant, async (tx) => expect(await tx`select 1 from public.expenses where id = ${eid}`).toHaveLength(1));
    await expect(as(id.ownerA, (tx) => newExpense(tx, id.ownerA, { category_id: catB }))).rejects.toThrow();
    await expect(as(id.ownerA, (tx) => newExpense(tx, randomUUID()))).rejects.toThrow();
    await expect(as(id.ownerA, (tx) => newExpense(tx, id.ownerA, { amount_cents: 0 }))).rejects.toThrow();
  });

  it("delete is owner/admin only; categories: owner/admin manage, never deleted", async () => {
    const eid = (await sql`insert into public.expenses (tenant_id, category_id, amount_cents, expense_date) values (${tA}, ${catA}, 100, '2026-05-01') returning id`)[0].id;
    await as(id.office, async (tx) => expect((await tx`delete from public.expenses where id = ${eid}`).count).toBe(0));
    await as(id.ownerA, async (tx) => expect((await tx`delete from public.expenses where id = ${eid}`).count).toBe(1));
    await as(id.office, async (tx) => {
      await expect(tx`savepoint c`.then(() => tx`insert into public.expense_categories (tenant_id, name) values (${tA}, 'Sneaky')`)).rejects.toThrow();
    });
    await as(id.ownerA, async (tx) => {
      await tx`insert into public.expense_categories (tenant_id, name) values (${tA}, 'Parking')`;
      expect((await tx`update public.expense_categories set is_active = false where id = ${catA}`).count).toBe(1);
      await tx`savepoint d`;
      await expect(tx`delete from public.expense_categories where id = ${catA}`).rejects.toThrow();
      await tx`rollback to savepoint d`;
      await tx`savepoint e`;
      await expect(tx`insert into public.expense_categories (tenant_id, name) values (${tA}, 'parking')`).rejects.toThrow(); // duplicate name
      await tx`rollback to savepoint e`;
    });
  });
});
