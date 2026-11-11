// Team invitations and member management. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("team invitations", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { owner: randomUUID(), admin: randomUUID(), emp: randomUUID(), guest: randomUUID(), busy: randomUUID(), other: randomUUID() };
  const mail = (k: keyof typeof id) => `tm-${k}-${id[k]}@test.local`;
  let tid = "", tbusy = "";

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

  /** Switch the open transaction to another signed-in user. */
  async function become(tx: postgres.TransactionSql, uid: string) {
    await tx`reset role`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
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
    for (const k of Object.keys(id) as (keyof typeof id)[]) {
      await sql`insert into auth.users (id, email, email_confirmed_at) values (${id[k]}, ${mail(k)}, now())`;
      await sql`insert into public.profiles (id, email) values (${id[k]}, ${mail(k)}) on conflict (id) do update set email = excluded.email`;
    }
    tid = await createTenant(id.owner, "Team Alpha");
    tbusy = await createTenant(id.busy, "Team Busy");
    await sql`insert into public.memberships (tenant_id, user_id, role) values (${tid}, ${id.admin}, 'admin'), (${tid}, ${id.emp}, 'employee')`;
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tid}, ${tbusy})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  const invite = async (tx: postgres.TransactionSql, email: string, role = "employee"): Promise<string> =>
    (await tx`select public.create_invitation(${tid}, ${email}, ${role}) as t`)[0].t;

  it("owner invites, the token is stored hashed, and the invitee joins with the right role", async () => {
    await as(id.owner, async (tx) => {
      const tok = await invite(tx, mail("guest").toUpperCase());
      const [row] = await tx`select email, token_hash from public.invitations where tenant_id = ${tid}`;
      expect(row.email).toBe(mail("guest"));
      expect(row.token_hash).not.toContain(tok);
      await become(tx, id.guest);
      expect((await tx`select * from public.invitation_preview(${tok})`)[0].company).toBe("Team Alpha");
      await tx`select public.accept_invitation(${tok})`;
      const [m] = await tx`select role, status from public.memberships where user_id = ${id.guest}`;
      expect([m.role, m.status]).toEqual(["employee", "active"]);
      await tx`savepoint s`;
      await expect(tx`select public.accept_invitation(${tok})`).rejects.toThrow(/invalid invitation/); // single use
      await tx`rollback to savepoint s`;
    });
  });

  it("a different account cannot use or even preview someone else's invitation", async () => {
    await as(id.owner, async (tx) => {
      const tok = await invite(tx, mail("guest"));
      await become(tx, id.other);
      expect(await tx`select * from public.invitation_preview(${tok})`).toHaveLength(0);
      await tx`savepoint s`;
      await expect(tx`select public.accept_invitation(${tok})`).rejects.toThrow(/invalid invitation/);
      await tx`rollback to savepoint s`;
    });
  });

  it("someone already in another company cannot join a second one", async () => {
    await as(id.owner, async (tx) => {
      const tok = await invite(tx, mail("busy"));
      await become(tx, id.busy);
      await tx`savepoint s`;
      await expect(tx`select public.accept_invitation(${tok})`).rejects.toThrow(/another company/);
      await tx`rollback to savepoint s`;
    });
  });

  it("expired invitations are rejected; a new invitation replaces the old one", async () => {
    await as(id.owner, async (tx) => {
      const old = await invite(tx, mail("guest"));
      const fresh = await invite(tx, mail("guest"));
      expect((await tx`select count(*)::int as n from public.invitations where tenant_id = ${tid} and status = 'pending'`)[0].n).toBe(1);
      await tx`reset role`;
      await tx`update public.invitations set expires_at = now() - interval '1 minute' where tenant_id = ${tid}`;
      await become(tx, id.guest);
      for (const tok of [old, fresh]) {
        await tx`savepoint s`;
        await expect(tx`select public.accept_invitation(${tok})`).rejects.toThrow(/invalid invitation/);
        await tx`rollback to savepoint s`;
      }
    });
  });

  it("only owner/admin can invite; only the owner invites admins; owners cannot be invited", async () => {
    await as(id.emp, async (tx) => {
      await tx`savepoint s`;
      await expect(invite(tx, "x@test.local")).rejects.toThrow(/not allowed/);
      await tx`rollback to savepoint s`;
      expect(await tx`select * from public.invitations`).toHaveLength(0);
    });
    await as(id.admin, async (tx) => {
      await invite(tx, "x@test.local", "manager");
      await tx`savepoint s`;
      await expect(invite(tx, "y@test.local", "admin")).rejects.toThrow(/owner can invite/);
      await tx`rollback to savepoint s`;
      await tx`savepoint o`;
      await expect(invite(tx, "z@test.local", "owner")).rejects.toThrow(/invalid role/);
      await tx`rollback to savepoint o`;
    });
    await as(id.other, async (tx) => {
      await tx`savepoint s`;
      await expect(invite(tx, "x@test.local")).rejects.toThrow(/not allowed/);
      await tx`rollback to savepoint s`;
    });
  });

  it("pending invitations reserve seats against the plan limit", async () => {
    // Throwaway plan: Starter is now one person, which can't show a reserved seat next to the owner, admin and employee.
    await sql`insert into public.plans (id, name, price_monthly_cents, price_yearly_cents, limits) values ('zz_team', 'Test', 0, 0, '{"max_users": 3}') on conflict (id) do nothing`;
    await sql`update public.subscriptions set plan_id = 'zz_team', status = 'active' where tenant_id = ${tid}`;
    try {
      await as(id.owner, async (tx) => {
        // owner + admin + employee = 3 = the plan's limit, so no seat is free
        await tx`savepoint s`;
        await expect(invite(tx, "seat1@test.local")).rejects.toThrow(/limit/);
        await tx`rollback to savepoint s`;
        await tx`update public.memberships set status = 'disabled' where tenant_id = ${tid} and user_id = ${id.emp}`;
        await invite(tx, "seat1@test.local"); // a seat is free again, and now reserved
        await tx`savepoint t`;
        await expect(invite(tx, "seat2@test.local")).rejects.toThrow(/limit/);
        await tx`rollback to savepoint t`;
      });
    } finally {
      await sql`update public.subscriptions set plan_id = 'trial', status = 'trialing' where tenant_id = ${tid}`;
      await sql`delete from public.plans where id = 'zz_team'`;
    }
  });

  it("owner protection: no last-owner removal, no self change, admins cannot touch the owner", async () => {
    await as(id.owner, async (tx) => {
      await tx`savepoint s`;
      await expect(tx`update public.memberships set status = 'disabled' where tenant_id = ${tid} and user_id = ${id.owner}`).rejects.toThrow();
      await tx`rollback to savepoint s`;
      await tx`update public.memberships set role = 'manager' where tenant_id = ${tid} and user_id = ${id.emp}`;
      await tx`update public.memberships set status = 'disabled' where tenant_id = ${tid} and user_id = ${id.emp}`;
    });
    await as(id.admin, async (tx) => {
      expect(await tx`update public.memberships set role = 'employee' where tenant_id = ${tid} and user_id = ${id.owner} returning id`).toHaveLength(0);
      await tx`savepoint s`;
      await expect(tx`update public.memberships set role = 'owner' where tenant_id = ${tid} and user_id = ${id.emp}`).rejects.toThrow();
      await tx`rollback to savepoint s`;
      await tx`savepoint t`;
      await expect(tx`update public.memberships set role = 'employee' where tenant_id = ${tid} and user_id = ${id.admin}`).rejects.toThrow(/own access/);
      await tx`rollback to savepoint t`;
    });
    await as(id.emp, async (tx) => {
      expect(await tx`update public.memberships set role = 'admin' where tenant_id = ${tid} and user_id = ${id.emp} returning id`).toHaveLength(0);
    });
  });
});
