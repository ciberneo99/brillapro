// public.my_app_context(): the one-call replacement for the separate context queries. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

d("my_app_context (RLS)", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const userA = randomUUID();
  const userB = randomUUID();
  const loner = randomUUID();
  let tenantA = "";
  let tenantB = "";
  class Rollback extends Error {}

  async function as<T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>, role = "authenticated"): Promise<T> {
    let out!: T;
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role })}, true)`;
        await tx.unsafe(`set local role ${role}`);
        out = await fn(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    return out;
  }

  beforeAll(async () => {
    for (const [id, tag] of [[userA, "a"], [userB, "b"], [loner, "l"]] as const) {
      await sql`insert into auth.users (id, email) values (${id}, ${`ctx-${tag}-${id}@test.local`})`;
    }
    for (const [uid, name, set] of [[userA, "Context A Cleaning", (v: string) => { tenantA = v; }], [userB, "Context B Cleaning", (v: string) => { tenantB = v; }]] as const) {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        const [{ create_tenant }] = await tx`select public.create_tenant(${name})`;
        set(create_tenant as string);
      });
    }
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tenantA}, ${tenantB})`;
    await sql`delete from auth.users where id in (${userA}, ${userB}, ${loner})`;
    await sql.end();
  });

  it("returns the caller's own company, role, profile and settings", async () => {
    const [{ ctx }] = await as(userA, (tx) => tx`select public.my_app_context() as ctx`);
    expect(ctx.tenant.id).toBe(tenantA);
    expect(ctx.tenant.name).toBe("Context A Cleaning");
    expect(ctx.role).toBe("owner");
    expect(ctx.profile).toHaveProperty("locale");
    expect(ctx.settings).toHaveProperty("timezone");
    expect(ctx.settings).toHaveProperty("currency");
  });

  it("never returns another company's data", async () => {
    const [{ ctx }] = await as(userB, (tx) => tx`select public.my_app_context() as ctx`);
    expect(ctx.tenant.id).toBe(tenantB);
    expect(JSON.stringify(ctx)).not.toContain(tenantA);
  });

  it("returns null for a user without a company", async () => {
    const [{ ctx }] = await as(loner, (tx) => tx`select public.my_app_context() as ctx`);
    expect(ctx).toBeNull();
  });

  it("is not callable by anon", async () => {
    await expect(as(userA, (tx) => tx`select public.my_app_context()`, "anon")).rejects.toThrow();
  });
});
