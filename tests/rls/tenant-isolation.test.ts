// Tenant isolation tests against a REAL Postgres (Supabase) with migrations applied.
// Run: DATABASE_URL=... npm run test:rls   (skipped automatically when DATABASE_URL is missing)
// Use a development/test database only: it creates and deletes its own auth.users rows.
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

d("tenant isolation (RLS)", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const userA = randomUUID();
  const userB = randomUUID();
  const employeeA = randomUUID();
  let tenantA = "";
  let tenantB = "";

  /** Runs fn inside a transaction as role `authenticated` with the given user's JWT claims. */
  async function as<T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    let out!: T;
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        out = await fn(tx);
        throw new Rollback(); // never persist anything done "as" a user
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    return out;
  }
  class Rollback extends Error {}

  async function asCommit(uid: string, fn: (tx: postgres.TransactionSql) => Promise<void>) {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      await fn(tx);
    });
  }

  beforeAll(async () => {
    for (const [id, tag] of [[userA, "a"], [userB, "b"], [employeeA, "e"]] as const) {
      await sql`insert into auth.users (id, email) values (${id}, ${`rls-${tag}-${id}@test.local`})`;
    }
    await asCommit(userA, async (tx) => {
      [{ create_tenant: tenantA }] = await tx`select public.create_tenant('Tenant A Cleaning')`;
    });
    await asCommit(userB, async (tx) => {
      [{ create_tenant: tenantB }] = await tx`select public.create_tenant('Tenant B Cleaning')`;
    });
    // an employee that belongs to tenant A (set up as superuser, like an invitation flow would)
    await sql`insert into public.profiles (id, email) values (${employeeA}, 'e@test.local')`;
    await sql`insert into public.memberships (tenant_id, user_id, role) values (${tenantA}, ${employeeA}, 'employee')`;
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tenantA}, ${tenantB})`;
    await sql`delete from auth.users where id in (${userA}, ${userB}, ${employeeA})`;
    await sql.end();
  });

  it("owner sees only their own tenant", async () => {
    const rows = await as(userA, (tx) => tx`select id from public.tenants`);
    expect(rows.map((r) => r.id)).toEqual([tenantA]);
  });

  it("cannot read another tenant's rows in any table", async () => {
    await as(userA, async (tx) => {
      expect(await tx`select 1 from public.tenants where id = ${tenantB}`).toHaveLength(0);
      expect(await tx`select 1 from public.tenant_settings where tenant_id = ${tenantB}`).toHaveLength(0);
      expect(await tx`select 1 from public.memberships where tenant_id = ${tenantB}`).toHaveLength(0);
      expect(await tx`select 1 from public.subscriptions where tenant_id = ${tenantB}`).toHaveLength(0);
      expect(await tx`select 1 from public.audit_log where tenant_id = ${tenantB}`).toHaveLength(0);
      expect(await tx`select 1 from public.profiles where id = ${userB}`).toHaveLength(0);
    });
  });

  it("cannot update another tenant's data (0 rows affected)", async () => {
    await as(userA, async (tx) => {
      const t = await tx`update public.tenants set name = 'hacked' where id = ${tenantB}`;
      const s = await tx`update public.tenant_settings set currency = 'EUR' where tenant_id = ${tenantB}`;
      expect(t.count).toBe(0);
      expect(s.count).toBe(0);
    });
  });

  it("cannot insert a membership into another tenant", async () => {
    await expect(
      as(userA, (tx) => tx`insert into public.memberships (tenant_id, user_id, role) values (${tenantB}, ${userA}, 'owner')`),
    ).rejects.toThrow();
  });

  it("cannot forge audit entries for another tenant or actor", async () => {
    await expect(
      as(userA, (tx) => tx`insert into public.audit_log (tenant_id, actor_id, action) values (${tenantB}, ${userA}, 'x')`),
    ).rejects.toThrow();
    await expect(
      as(userA, (tx) => tx`insert into public.audit_log (tenant_id, actor_id, action) values (${tenantA}, ${userB}, 'x')`),
    ).rejects.toThrow();
  });

  it("subscriptions are read-only for tenants", async () => {
    await expect(
      as(userA, (tx) => tx`update public.subscriptions set status = 'active' where tenant_id = ${tenantA}`),
    ).rejects.toThrow();
  });

  it("platform_admins is unreachable for users", async () => {
    await expect(as(userA, (tx) => tx`select * from public.platform_admins`)).rejects.toThrow();
  });

  it("employee role cannot change business settings or memberships", async () => {
    await as(employeeA, async (tx) => {
      const s = await tx`update public.tenant_settings set currency = 'EUR' where tenant_id = ${tenantA}`;
      expect(s.count).toBe(0);
      const m = await tx`update public.memberships set role = 'owner' where user_id = ${employeeA}`;
      expect(m.count).toBe(0);
      expect(await tx`select 1 from public.audit_log where tenant_id = ${tenantA}`).toHaveLength(0);
    });
  });

  it("owner can update their own settings", async () => {
    await as(userA, async (tx) => {
      const s = await tx`update public.tenant_settings set currency = 'MXN' where tenant_id = ${tenantA}`;
      expect(s.count).toBe(1);
    });
  });

  it("unauthenticated (anon) role sees nothing", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`set local role anon`;
        await tx`select * from public.tenants`;
      }),
    ).rejects.toThrow();
  });
});
