// Phase 9b tests: plans and the per-plan limit on people. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("plans and limits", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { owner: randomUUID(), other: randomUUID(), u1: randomUUID(), u2: randomUUID(), u3: randomUUID(), outsider: randomUUID() };
  let tid = "", tother = "";

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
    for (const [k, v] of Object.entries(id)) await sql`insert into auth.users (id, email) values (${v}, ${`pl-${k}-${v}@test.local`})`;
    tid = await createTenant(id.owner, "Plan Alpha");
    tother = await createTenant(id.other, "Plan Beta");
    for (const k of ["u1", "u2", "u3"] as const) await sql`insert into public.profiles (id, email) values (${id[k]}, ${`${k}-${id[k]}@test.local`}) on conflict do nothing`;
    await sql`insert into public.profiles (id, email) values (${id.outsider}, ${`o-${id.outsider}@test.local`}) on conflict do nothing`;
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tid}, ${tother})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  const add = (tx: postgres.TransactionSql, uid: string, role = "employee") =>
    tx`insert into public.memberships (tenant_id, user_id, role) values (${tid}, ${uid}, ${role})`;

  it("plans exist with the limits the landing page advertises", async () => {
    const rows = await sql`select id, price_monthly_cents, limits from public.plans where id in ('starter','pro','business','trial') order by price_monthly_cents`;
    expect(rows.map((r) => [r.id, r.limits.max_users])).toEqual([["trial", 10], ["starter", 3], ["pro", 10], ["business", 25]]);
  });

  it("a new company starts on the trial limit and can see its own usage", async () => {
    await as(id.owner, async (tx) => {
      const [u] = await tx`select * from public.tenant_usage(${tid})`;
      expect([u.users, u.max_users]).toEqual([1, 10]);
    });
  });

  it("people can't be added beyond the plan, and disabled people don't count", async () => {
    await sql`update public.subscriptions set plan_id = 'starter', status = 'active' where tenant_id = ${tid}`;
    await as(id.owner, async (tx) => {
      await add(tx, id.u1);
      await add(tx, id.u2, "manager");
      await tx`savepoint s`;
      await expect(add(tx, id.u3)).rejects.toThrow(/limit/); // owner + 2 = 3 = Starter limit
      await tx`rollback to savepoint s`;
      await tx`update public.memberships set status = 'disabled' where tenant_id = ${tid} and user_id = ${id.u2}`;
      await add(tx, id.u3); // a seat is free again
      const [u] = await tx`select * from public.tenant_usage(${tid})`;
      expect([u.users, u.max_users]).toEqual([3, 3]);
      await tx`savepoint r`;
      await expect(tx`update public.memberships set status = 'active' where tenant_id = ${tid} and user_id = ${id.u2}`).rejects.toThrow(/limit/); // can't re-enable past the limit
      await tx`rollback to savepoint r`;
    });
    await sql`update public.subscriptions set plan_id = 'trial', status = 'trialing' where tenant_id = ${tid}`;
  });

  it("usage is only visible to members of that company", async () => {
    await as(id.outsider, async (tx) => expect(await tx`select * from public.tenant_usage(${tid})`).toHaveLength(0));
    await as(id.other, async (tx) => expect(await tx`select * from public.tenant_usage(${tid})`).toHaveLength(0));
    await as(id.other, async (tx) => {
      await tx`savepoint s`;
      await expect(tx`select public.tenant_plan_limit(${tid}, 'max_users')`).rejects.toThrow(); // internal helper is not callable by users
      await tx`rollback to savepoint s`;
    });
  });

  it("plans can't be changed by users", async () => {
    await as(id.owner, async (tx) => {
      await tx`savepoint s`;
      await expect(tx`update public.plans set limits = '{"max_users": 9999}' where id = 'starter'`).rejects.toThrow();
      await tx`rollback to savepoint s`;
    });
  });
});
