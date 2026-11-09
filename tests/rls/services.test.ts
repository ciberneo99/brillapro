// Phase 3a security tests: service types and checklist templates. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("service types & checklist templates (RLS)", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { ownerA: randomUUID(), ownerB: randomUUID(), manager: randomUUID(), office: randomUUID(), employee: randomUUID(), accountant: randomUUID() };
  let tenantA = "", tenantB = "";

  async function as<T>(uid: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    let out!: T;
    try {
      await sql.begin(async (tx) => {
        if (uid) {
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
          await tx`set local role authenticated`;
        } else await tx`set local role anon`;
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
    const [t] = await sql`select tenant_id from public.memberships where user_id = ${uid}`;
    return t.tenant_id;
  }

  beforeAll(async () => {
    for (const [k, v] of Object.entries(id)) await sql`insert into auth.users (id, email) values (${v}, ${`s-${k}-${v}@test.local`})`;
    tenantA = await createTenant(id.ownerA, "Svc Alpha", "es"); // Spanish company
    tenantB = await createTenant(id.ownerB, "Svc Beta", "en");
    for (const [uid, role] of [[id.manager, "manager"], [id.office, "office_staff"], [id.employee, "employee"], [id.accountant, "accountant"]] as const) {
      await sql`insert into public.profiles (id, email) values (${uid}, ${`${role}@test.local`})`;
      await sql`insert into public.memberships (tenant_id, user_id, role) values (${tenantA}, ${uid}, ${role})`;
    }
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tenantA}, ${tenantB})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  const svc = async (tenant: string, code: string) =>
    (await sql`select id from public.service_types where tenant_id = ${tenant} and code = ${code}`)[0].id as string;

  it("a new company gets the 7 service types and starter templates, in its language", async () => {
    const es = await sql`select code, name from public.service_types where tenant_id = ${tenantA} order by sort_order`;
    expect(es.map((r) => r.code)).toEqual(["standard", "deep", "move_in", "move_out", "recurring", "office", "custom"]);
    expect(es[0].name).toBe("Limpieza estándar");
    const en = await sql`select name from public.service_types where tenant_id = ${tenantB} and code = 'standard'`;
    expect(en[0].name).toBe("Standard Cleaning");
    const tpl = await sql`select count(*)::int n from public.checklist_templates where tenant_id = ${tenantB} and is_active`;
    expect(tpl[0].n).toBe(2);
    const items = await sql`select category, title, position from public.checklist_template_items i
      join public.checklist_templates t on t.id = i.template_id and t.tenant_id = i.tenant_id
      where t.tenant_id = ${tenantB} and t.name = 'Standard Cleaning' order by position`;
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(items.map((i) => i.position)).toEqual([...items.map((i) => i.position)].sort((a, b) => a - b));
  });

  it("isolation: another company sees and changes nothing", async () => {
    const sA = await svc(tenantA, "standard");
    await as(id.ownerB, async (tx) => {
      expect(await tx`select 1 from public.service_types where tenant_id = ${tenantA}`).toHaveLength(0);
      expect(await tx`select 1 from public.checklist_templates where tenant_id = ${tenantA}`).toHaveLength(0);
      expect(await tx`select 1 from public.checklist_template_items where tenant_id = ${tenantA}`).toHaveLength(0);
      expect((await tx`update public.service_types set name = 'x' where id = ${sA}`).count).toBe(0);
    });
    await expect(as(id.ownerB, (tx) => tx`insert into public.service_types (tenant_id, name) values (${tenantA}, 'Intruder')`)).rejects.toThrow();
  });

  it("a template cannot point to another company's service type", async () => {
    const sA = await svc(tenantA, "standard");
    // The composite FK is deferred to commit; force the check now (these tests never commit).
    await expect(
      as(id.ownerB, async (tx) => {
        await tx`insert into public.checklist_templates (tenant_id, service_type_id, name, is_active) values (${tenantB}, ${sA}, 'Cross', false)`;
        await tx`set constraints all immediate`;
      }),
    ).rejects.toThrow();
  });

  it("owner renames service types; names are unique per company (case-insensitive)", async () => {
    const sA = await svc(tenantA, "custom");
    await as(id.ownerA, async (tx) => {
      expect((await tx`update public.service_types set name = 'Airbnb turnover' where id = ${sA}`).count).toBe(1);
      await expect(tx.savepoint((sp) => sp`insert into public.service_types (tenant_id, name) values (${tenantA}, 'AIRBNB TURNOVER')`)).rejects.toThrow();
    });
  });

  it("role permissions: employee reads; only owner/admin edit service types; managers edit templates", async () => {
    const sA = await svc(tenantA, "deep");
    await as(id.employee, async (tx) => {
      expect((await tx`select 1 from public.service_types`).length).toBe(7);
      expect((await tx`select 1 from public.checklist_template_items`).length).toBeGreaterThan(0);
      expect((await tx`update public.service_types set name = 'x' where id = ${sA}`).count).toBe(0);
    });
    await expect(as(id.employee, (tx) => tx`insert into public.checklist_templates (tenant_id, service_type_id, name, is_active) values (${tenantA}, ${sA}, 'No', false)`)).rejects.toThrow();
    await as(id.accountant, async (tx) => {
      expect(await tx`select 1 from public.service_types`).toHaveLength(0);
      expect(await tx`select 1 from public.checklist_templates`).toHaveLength(0);
    });
    await as(id.manager, async (tx) => {
      expect((await tx`update public.service_types set name = 'x' where id = ${sA}`).count).toBe(0); // managers cannot edit the catalog
      const [t] = await tx`insert into public.checklist_templates (tenant_id, service_type_id, name, is_active) values (${tenantA}, ${sA}, 'Mgr template', false) returning id`;
      await tx`insert into public.checklist_template_items (tenant_id, template_id, title, position) values (${tenantA}, ${t.id}, 'Task', 1)`;
      expect((await tx`update public.checklist_templates set name = 'Renamed' where id = ${t.id}`).count).toBe(1);
    });
    await as(id.office, async (tx) => {
      expect((await tx`select 1 from public.checklist_templates`).length).toBeGreaterThan(0); // can read to quote
      await expect(tx.savepoint((sp) => sp`insert into public.checklist_templates (tenant_id, service_type_id, name, is_active) values (${tenantA}, ${sA}, 'No', false)`)).rejects.toThrow();
    });
  });

  it("only one ACTIVE template per service type", async () => {
    const sA = await svc(tenantA, "standard"); // already has an active starter template
    await as(id.ownerA, async (tx) => {
      await expect(tx.savepoint((sp) => sp`insert into public.checklist_templates (tenant_id, service_type_id, name, is_active) values (${tenantA}, ${sA}, 'Second', true)`)).rejects.toThrow();
      await tx`insert into public.checklist_templates (tenant_id, service_type_id, name, is_active) values (${tenantA}, ${sA}, 'Draft', false)`; // inactive ones are fine
      await tx`update public.checklist_templates set is_active = false where tenant_id = ${tenantA} and service_type_id = ${sA} and name <> 'Draft'`;
      expect((await tx`update public.checklist_templates set is_active = true where tenant_id = ${tenantA} and name = 'Draft'`).count).toBe(1);
    });
  });

  it("service types and templates cannot be deleted; template items can", async () => {
    const sA = await svc(tenantA, "office");
    await expect(as(id.ownerA, (tx) => tx`delete from public.service_types where id = ${sA}`)).rejects.toThrow();
    await expect(as(id.ownerA, (tx) => tx`delete from public.checklist_templates where tenant_id = ${tenantA}`)).rejects.toThrow();
    await as(id.manager, async (tx) => {
      const n = await tx`delete from public.checklist_template_items where tenant_id = ${tenantA} returning 1`;
      expect(n.length).toBeGreaterThan(0);
    });
    await as(id.employee, async (tx) => {
      expect((await tx`delete from public.checklist_template_items where tenant_id = ${tenantA}`).count).toBe(0);
    });
  });

  it("tenant_id and code are immutable; anon sees nothing", async () => {
    const sA = await svc(tenantA, "move_in");
    await expect(as(id.ownerA, (tx) => tx`update public.service_types set tenant_id = ${tenantB} where id = ${sA}`)).rejects.toThrow();
    await expect(as(id.ownerA, (tx) => tx`update public.service_types set code = 'custom' where id = ${sA}`)).rejects.toThrow();
    for (const table of ["service_types", "checklist_templates", "checklist_template_items"])
      await expect(as(null, (tx) => tx.unsafe(`select 1 from public.${table}`))).rejects.toThrow();
  });
});

d("checklist operations (atomic functions)", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { owner: randomUUID(), other: randomUUID(), employee: randomUUID() };
  let tenant = "", otherTenant = "";

  async function as<T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    let out!: T;
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        out = await fn(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    return out;
  }
  const mk = async (uid: string, name: string) => {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      await tx`select public.create_tenant(${name}, 'en')`;
    });
    return (await sql`select tenant_id from public.memberships where user_id = ${uid}`)[0].tenant_id as string;
  };

  beforeAll(async () => {
    for (const [k, v] of Object.entries(id)) await sql`insert into auth.users (id, email) values (${v}, ${`o-${k}-${v}@test.local`})`;
    tenant = await mk(id.owner, "Ops Alpha");
    otherTenant = await mk(id.other, "Ops Beta");
    await sql`insert into public.profiles (id, email) values (${id.employee}, 'emp@test.local')`;
    await sql`insert into public.memberships (tenant_id, user_id, role) values (${tenant}, ${id.employee}, 'employee')`;
  });
  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tenant}, ${otherTenant})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  it("activating a template deactivates the others of the same service, atomically", async () => {
    const [{ id: std }] = await sql`select id from public.service_types where tenant_id = ${tenant} and code = 'standard'`;
    await as(id.owner, async (tx) => {
      const [draft] = await tx`insert into public.checklist_templates (tenant_id, service_type_id, name, is_active) values (${tenant}, ${std}, 'Alt', false) returning id`;
      await tx`select public.activate_checklist_template(${draft.id})`;
      const rows = await tx`select name, is_active from public.checklist_templates where service_type_id = ${std} order by name`;
      expect(rows.filter((r) => r.is_active).map((r) => r.name)).toEqual(["Alt"]);
    });
  });

  it("reordering renumbers items and rejects foreign ids", async () => {
    await as(id.owner, async (tx) => {
      const [tpl] = await tx`select id from public.checklist_templates where tenant_id = ${tenant} and name = 'Standard Cleaning'`;
      const items = await tx`select id from public.checklist_template_items where template_id = ${tpl.id} order by position`;
      const reversed = items.map((i) => i.id).reverse();
      await tx`select public.reorder_template_items(${tpl.id}, ${reversed})`;
      const after = await tx`select id from public.checklist_template_items where template_id = ${tpl.id} order by position`;
      expect(after.map((i) => i.id)).toEqual(reversed);
      await expect(tx.savepoint((sp) => sp`select public.reorder_template_items(${tpl.id}, ${[randomUUID()]})`)).rejects.toThrow();
    });
  });

  it("other companies and low-privilege roles cannot use the functions", async () => {
    const [tpl] = await sql`select id from public.checklist_templates where tenant_id = ${tenant} and name = 'Standard Cleaning'`;
    await expect(as(id.other, (tx) => tx`select public.activate_checklist_template(${tpl.id})`)).rejects.toThrow();
    await expect(as(id.other, (tx) => tx`select public.reorder_template_items(${tpl.id}, ${[]})`)).rejects.toThrow();
    await expect(as(id.employee, (tx) => tx`select public.activate_checklist_template(${tpl.id})`)).rejects.toThrow();
  });
});
