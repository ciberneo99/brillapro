// Phase 9d: Super Admin. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("platform admin", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { root: randomUUID(), owner: randomUUID(), stranger: randomUUID() };
  let tid = "";

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

  beforeAll(async () => {
    for (const [k, v] of Object.entries(id)) {
      await sql`insert into auth.users (id, email, email_confirmed_at) values (${v}, ${`pa-${k}-${v}@test.local`}, now())`;
      await sql`insert into public.profiles (id, email) values (${v}, ${`pa-${k}-${v}@test.local`}) on conflict do nothing`;
    }
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id.owner, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      await tx`select public.create_tenant('Platform Alpha', 'en')`;
    });
    tid = (await sql`select tenant_id from public.memberships where user_id = ${id.owner}`)[0].tenant_id;
    await sql`insert into public.platform_admins (user_id) values (${id.root})`;
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id = ${tid}`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  it("only platform admins can list companies or change anything", async () => {
    await as(id.owner, async (tx) => {
      expect((await tx`select public.is_platform_admin() as a`)[0].a).toBe(false);
      expect(await tx`select * from public.platform_companies()`).toHaveLength(0);
      await tx`savepoint s`;
      await expect(tx`select public.platform_set_company_status(${tid}, 'suspended', 'x')`).rejects.toThrow(/not allowed/);
      await tx`rollback to savepoint s`;
      await tx`savepoint t`;
      await expect(tx`select public.platform_set_plan(${tid}, 'business', 'active')`).rejects.toThrow(/not allowed/);
      await tx`rollback to savepoint t`;
      await tx`savepoint u`;
      await expect(tx`insert into public.platform_admins (user_id) values (${id.owner})`).rejects.toThrow();
      await tx`rollback to savepoint u`;
    });
  });

  it("a platform admin sees company counts and can change plan and trial, with an audit trail", async () => {
    await as(id.root, async (tx) => {
      const mine = (await tx`select * from public.platform_companies()`).find((r) => r.id === tid)!;
      expect([mine.name, mine.users, mine.customers, mine.plan_id]).toEqual(["Platform Alpha", 1, 0, "trial"]);
      await tx`select public.platform_set_plan(${tid}, 'pro', 'active')`;
      await tx`select public.platform_extend_trial(${tid}, 5)`.catch(() => {});
    });
    await as(id.root, async (tx) => {
      await tx`savepoint s`;
      await expect(tx`select public.platform_extend_trial(${tid}, 500)`).rejects.toThrow(/invalid days/);
      await tx`rollback to savepoint s`;
      await tx`select public.platform_set_plan(${tid}, 'pro', 'active')`;
      await tx`reset role`;
      const log = await tx`select action, actor_id from public.audit_log where tenant_id = ${tid} and action like 'platform.%'`;
      expect(log.map((l) => l.action)).toContain("platform.plan_changed");
      expect(log[0].actor_id).toBe(id.root);
    });
  });

  it("platform admin does not gain access to company data", async () => {
    await as(id.root, async (tx) => {
      expect(await tx`select * from public.customers where tenant_id = ${tid}`).toHaveLength(0);
      expect(await tx`select * from public.memberships where tenant_id = ${tid}`).toHaveLength(0);
    });
  });

  it("a suspended company is locked out, told so, and can be restored", async () => {
    await as(id.root, async (tx) => {
      await tx`select public.platform_set_company_status(${tid}, 'suspended', 'test')`;
      await tx`reset role`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id.owner, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      expect((await tx`select public.my_company_suspended() as s`)[0].s).toBe(true);
      expect(await tx`select * from public.memberships where tenant_id = ${tid}`).toHaveLength(0);
      expect(await tx`select * from public.tenant_settings where tenant_id = ${tid}`).toHaveLength(0);
      await tx`reset role`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id.root, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      await tx`select public.platform_set_company_status(${tid}, 'active', null)`;
      await tx`reset role`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id.owner, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      expect((await tx`select public.my_company_suspended() as s`)[0].s).toBe(false);
      expect(await tx`select * from public.memberships where tenant_id = ${tid}`).toHaveLength(1);
    });
    await as(id.stranger, async (tx) => expect((await tx`select public.my_company_suspended() as s`)[0].s).toBe(false));
  });
});
