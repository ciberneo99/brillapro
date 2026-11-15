// Phase 5a tests: invoices, payments, totals, statuses, roles, isolation. Needs DATABASE_URL (dev DB only).
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;
class Rollback extends Error {}

d("invoices & payments", () => {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const id = { ownerA: randomUUID(), ownerB: randomUUID(), office: randomUUID(), accountant: randomUUID(), manager: randomUUID(), employee: randomUUID() };
  let tA = "", tB = "", custA = "", custB = "";

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
    for (const [k, v] of Object.entries(id)) await sql`insert into auth.users (id, email) values (${v}, ${`i-${k}-${v}@test.local`})`;
    tA = await createTenant(id.ownerA, "Inv Alpha");
    tB = await createTenant(id.ownerB, "Inv Beta");
    for (const [uid, role] of [[id.office, "office_staff"], [id.accountant, "accountant"], [id.manager, "manager"], [id.employee, "employee"]] as const) {
      await sql`insert into public.profiles (id, email) values (${uid}, ${`${role}-${uid}@test.local`})`;
      await sql`insert into public.memberships (tenant_id, user_id, role) values (${tA}, ${uid}, ${role})`;
    }
    custA = (await sql`insert into public.customers (tenant_id, first_name, last_name, status, email) values (${tA}, 'Ann', 'Lee', 'active', 'a@b.co') returning id`)[0].id;
    custB = (await sql`insert into public.customers (tenant_id, first_name, status) values (${tB}, 'Bob', 'active') returning id`)[0].id;
  });

  afterAll(async () => {
    await sql`delete from public.tenants where id in (${tA}, ${tB})`;
    await sql`delete from auth.users where id in ${sql(Object.values(id))}`;
    await sql.end();
  });

  const newInvoice = (tx: postgres.TransactionSql, uid: string, extra = {}) =>
    tx`insert into public.invoices ${tx({ tenant_id: tA, customer_id: custA, due_date: "2099-12-31", created_by: uid, ...extra })} returning id, number`;
  const line = (tx: postgres.TransactionSql, inv: string, desc: string, qty: number, cents: number) =>
    tx`insert into public.invoice_lines (tenant_id, invoice_id, description, quantity, unit_price_cents) values (${tA}, ${inv}, ${desc}, ${qty}, ${cents})`;

  it("numbers are sequential per company; totals = lines − capped discount + tax; payments reduce balance", async () => {
    await as(id.office, async (tx) => {
      const a = (await newInvoice(tx, id.office))[0];
      const b = (await newInvoice(tx, id.office))[0];
      expect(b.number).toBe(a.number + 1);
      await line(tx, a.id, "Clean", 2, 7500);
      await line(tx, a.id, "Oven", 1, 2599);
      await tx`update public.invoices set discount_cents = 1000, tax_rate = 8.25 where id = ${a.id}`;
      // subtotal 17599 − 1000 = 16599; tax 1369.4 → 1369; total 17968
      const [t] = await tx`select * from public.invoice_totals(${a.id})`;
      expect([t.subtotal_cents, t.discount_cents, t.tax_cents, t.total_cents, t.paid_cents, t.balance_cents].map(Number)).toEqual([17599, 1000, 1369, 17968, 0, 17968]);
      await tx`select public.issue_invoice(${a.id})`;
      await tx`select public.record_payment(${a.id}, 10000, current_date, 'cash', null, null)`;
      const [ov] = await tx`select display_status, balance_cents from public.invoices_overview where id = ${a.id}`;
      expect(ov.display_status).toBe("partial");
      expect(Number(ov.balance_cents)).toBe(7968);
      await tx`select public.record_payment(${a.id}, 7968, current_date, 'zelle', 'ref1', 'rest')`;
      expect((await tx`select display_status from public.invoices_overview where id = ${a.id}`)[0].display_status).toBe("paid");
    });
    await as(id.ownerB, async (tx) => {
      const x = (await tx`insert into public.invoices (tenant_id, customer_id, due_date, created_by) values (${tB}, ${custB}, '2099-01-01', ${id.ownerB}) returning number`)[0];
      expect(x.number).toBe(1);
    });
  });

  it("payments: not on drafts, never above the balance, no direct writes, no void when paid", async () => {
    await as(id.office, async (tx) => {
      const inv = (await newInvoice(tx, id.office))[0].id;
      await line(tx, inv, "Clean", 1, 5000);
      await tx`savepoint a`;
      await expect(tx`select public.record_payment(${inv}, 100, current_date, 'cash', null, null)`).rejects.toThrow(/not open/);
      await tx`rollback to savepoint a`;
      await tx`savepoint e`;
      await expect(tx`select public.issue_invoice(${(await newInvoice(tx, id.office))[0].id})`).rejects.toThrow(/no lines/); // empty invoice
      await tx`rollback to savepoint e`;
      await tx`select public.issue_invoice(${inv})`;
      await tx`savepoint b`;
      await expect(tx`select public.record_payment(${inv}, 5001, current_date, 'cash', null, null)`).rejects.toThrow(/exceeds/);
      await tx`rollback to savepoint b`;
      await tx`savepoint c`;
      await expect(tx`select public.record_payment(${inv}, 100, current_date, 'Bit coin!', null, null)`).rejects.toThrow();
      await tx`rollback to savepoint c`;
      await tx`savepoint dd`;
      await expect(tx`insert into public.payments (tenant_id, invoice_id, amount_cents, paid_on, method) values (${tA}, ${inv}, 100, current_date, 'cash')`).rejects.toThrow();
      await tx`rollback to savepoint dd`;
      await tx`select public.record_payment(${inv}, 100, current_date, 'check', '#12', null)`;
      await tx`savepoint v`;
      await expect(tx`select public.void_invoice(${inv})`).rejects.toThrow(/has payments/);
      await tx`rollback to savepoint v`;
    });
  });

  it("sent invoices are locked; void works when unpaid; overdue is derived", async () => {
    await as(id.ownerA, async (tx) => {
      const inv = (await newInvoice(tx, id.ownerA, { issue_date: "2000-01-01", due_date: "2000-01-15" }))[0].id;
      await line(tx, inv, "Old", 1, 5000);
      await tx`select public.issue_invoice(${inv})`;
      expect((await tx`select display_status from public.invoices_overview where id = ${inv}`)[0].display_status).toBe("overdue");
      expect((await tx`update public.invoices set notes = 'x' where id = ${inv}`).count).toBe(0);
      expect((await tx`delete from public.invoices where id = ${inv}`).count).toBe(0);
      await tx`savepoint late`;
      await expect(line(tx, inv, "late", 1, 100)).rejects.toThrow();
      await tx`rollback to savepoint late`;
      await tx`select public.void_invoice(${inv})`;
      expect((await tx`select display_status from public.invoices_overview where id = ${inv}`)[0].display_status).toBe("void");
    });
  });

  it("roles & isolation: accountant reads only; manager/employee/other company see nothing", async () => {
    const inv = (await sql`insert into public.invoices (tenant_id, customer_id, due_date) values (${tA}, ${custA}, '2099-01-01') returning id`)[0].id;
    await as(id.accountant, async (tx) => {
      expect(await tx`select 1 from public.invoices where id = ${inv}`).toHaveLength(1);
      await expect(tx`savepoint s`.then(() => newInvoice(tx, id.accountant))).rejects.toThrow();
    });
    await expect(as(id.accountant, (tx) => tx`select public.issue_invoice(${inv})`)).rejects.toThrow();
    for (const u of [id.manager, id.employee, id.ownerB])
      await as(u, async (tx) => {
        expect(await tx`select 1 from public.invoices where id = ${inv}`).toHaveLength(0);
        expect(await tx`select 1 from public.invoices_overview where id = ${inv}`).toHaveLength(0);
      });
    await expect(as(id.ownerB, (tx) => tx`select public.record_payment(${inv}, 1, current_date, 'cash', null, null)`)).rejects.toThrow();
    await expect(as(id.ownerA, (tx) => newInvoice(tx, id.ownerA, { customer_id: custB }))).rejects.toThrow(); // other company's customer
  });

  it("invoice from job: single line without a quote; one invoice per job; copies the quote when there is one", async () => {
    await as(id.ownerA, async (tx) => {
      const svc = (await tx`select id from public.service_types where tenant_id = ${tA} and code = 'standard'`)[0].id;
      const job = (await tx`insert into public.jobs (tenant_id, customer_id, title, scheduled_date, price_cents, customer_name, created_by)
        values (${tA}, ${custA}, 'Manual job', '2099-01-01', 12000, 'Ann Lee', ${id.ownerA}) returning id`)[0].id;
      const inv = (await tx`select public.create_invoice_from_job(${job}) as id`)[0].id;
      const [t] = await tx`select * from public.invoice_totals(${inv})`;
      expect(Number(t.total_cents)).toBe(12000);
      expect((await tx`select customer_name, customer_email from public.invoices where id = ${inv}`)[0]).toMatchObject({ customer_name: "Ann Lee", customer_email: "a@b.co" });
      await tx`savepoint s`;
      await expect(tx`select public.create_invoice_from_job(${job})`).rejects.toThrow(/invoice exists/);
      await tx`rollback to savepoint s`;

      // from an accepted quote: option + extras, discount and tax carried over
      const q = (await tx`insert into public.quotes (tenant_id, customer_id, expires_on, created_by, service_type_id, tax_rate, discount_cents, title)
        values (${tA}, ${custA}, '2099-01-01', ${id.ownerA}, ${svc}, 10, 500, 'Spring') returning id`)[0].id;
      const o = (await tx`insert into public.quote_options (tenant_id, quote_id, name, base_price_cents) values (${tA}, ${q}, 'Good', 10000) returning id`)[0].id;
      await tx`insert into public.quote_lines (tenant_id, quote_id, description, quantity, unit_price_cents) values (${tA}, ${q}, 'Oven', 1, 2500)`;
      await tx`select public.set_quote_status(${q}, 'accepted', ${o})`;
      const qt = Number((await tx`select total_cents from public.quote_totals(${q}) where option_id = ${o}`)[0].total_cents);
      const j2 = (await tx`select public.create_job_from_quote(${q}, '2099-02-01') as id`)[0].id;
      const inv2 = (await tx`select public.create_invoice_from_job(${j2}) as id`)[0].id;
      expect(Number((await tx`select total_cents from public.invoice_totals(${inv2})`)[0].total_cents)).toBe(qt);
      expect((await tx`select count(*)::int n from public.invoice_lines where invoice_id = ${inv2}`)[0].n).toBe(2);
    });
  });

  it("duplicate_invoice makes a fresh draft with the same lines, discount and tax; roles and companies are enforced", async () => {
    await as(id.office, async (tx) => {
      const a = (await newInvoice(tx, id.office))[0];
      await line(tx, a.id, "Weekly clean", 1, 12000);
      await line(tx, a.id, "Extra", 2, 1500);
      await tx`update public.invoices set discount_cents = 500, tax_rate = 5, notes = 'gate code 1234' where id = ${a.id}`;
      await tx`select public.issue_invoice(${a.id})`;
      const nid = (await tx`select public.duplicate_invoice(${a.id}) as id`)[0].id;
      const n = (await tx`select * from public.invoices where id = ${nid}`)[0];
      expect([n.status, n.number, n.discount_cents, Number(n.tax_rate), n.notes, n.job_id, n.sent_at]).toEqual(["draft", a.number + 1, 500, 5, "gate code 1234", null, null]);
      const [t] = await tx`select * from public.invoice_totals(${nid})`;
      const [o] = await tx`select * from public.invoice_totals(${a.id})`;
      expect(Number(t.total_cents)).toBe(Number(o.total_cents));
      expect((await tx`select count(*)::int n from public.invoice_lines where invoice_id = ${nid}`)[0].n).toBe(2);
      expect((await tx`select count(*)::int n from public.payments where invoice_id = ${nid}`)[0].n).toBe(0);
    });
    const src = (await sql`insert into public.invoices (tenant_id, customer_id, due_date) values (${tA}, ${custA}, '2099-01-01') returning id`)[0].id;
    for (const u of [id.accountant, id.manager, id.employee, id.ownerB]) {
      await as(u, async (tx) => {
        await tx`savepoint s`;
        await expect(tx`select public.duplicate_invoice(${src})`).rejects.toThrow();
        await tx`rollback to savepoint s`;
      });
    }
  });

  it("save_invoice_draft: saves header + lines in order, drafts only, own company only, roles", async () => {
    const hdr = (extra = {}) => ({ customer_id: custA, customer_name: " Ann Lee ", customer_email: "", billing_address: "1 Main St", issue_date: "2099-01-01", due_date: "2099-01-31", discount_cents: 100, tax_rate: 5, notes: "", terms: "T", ...extra });
    const lines = [{ description: "Second", quantity: 1, unit_price_cents: 500 }, { description: "First", quantity: 2, unit_price_cents: 250 }];
    const src = (await sql`insert into public.invoices (tenant_id, customer_id, due_date) values (${tA}, ${custA}, '2099-01-01') returning id`)[0].id;
    await as(id.office, async (tx) => {
      await tx`select public.save_invoice_draft(${src}, ${tx.json(hdr())}, ${tx.json(lines)})`;
      const rows = await tx`select description, position from public.invoice_lines where invoice_id = ${src} order by position`;
      expect(rows.map((r) => r.description)).toEqual(["Second", "First"]);
      const [i] = await tx`select customer_name, customer_email, notes, due_date::text d from public.invoices where id = ${src}`;
      expect([i.customer_name, i.customer_email, i.notes, i.d]).toEqual(["Ann Lee", null, null, "2099-01-31"]);
      // saving again replaces the lines (reordered)
      await tx`select public.save_invoice_draft(${src}, ${tx.json(hdr())}, ${tx.json([...lines].reverse())})`;
      expect((await tx`select description from public.invoice_lines where invoice_id = ${src} order by position`).map((r) => r.description)).toEqual(["First", "Second"]);
      // a customer from another company is refused
      await tx`savepoint x`;
      await expect(tx`select public.save_invoice_draft(${src}, ${tx.json(hdr({ customer_id: custB }))}, ${tx.json(lines)})`).rejects.toThrow(/customer not found/);
      await tx`rollback to savepoint x`;
      // bad dates / bad lines fail as a whole (nothing half-saved)
      await tx`savepoint y`;
      await expect(tx`select public.save_invoice_draft(${src}, ${tx.json(hdr({ due_date: "2098-01-01" }))}, ${tx.json(lines)})`).rejects.toThrow();
      await tx`rollback to savepoint y`;
      await tx`savepoint z`;
      await expect(tx`select public.save_invoice_draft(${src}, ${tx.json(hdr())}, ${tx.json([{ description: "", quantity: 1, unit_price_cents: 1 }])})`).rejects.toThrow();
      await tx`rollback to savepoint z`;
      // sent invoices are locked
      await tx`select public.issue_invoice(${src})`;
      await tx`savepoint w`;
      await expect(tx`select public.save_invoice_draft(${src}, ${tx.json(hdr())}, ${tx.json(lines)})`).rejects.toThrow(/only drafts/);
      await tx`rollback to savepoint w`;
    });
    const src2 = (await sql`insert into public.invoices (tenant_id, customer_id, due_date) values (${tA}, ${custA}, '2099-01-01') returning id`)[0].id;
    for (const u of [id.accountant, id.manager, id.employee, id.ownerB]) {
      await as(u, async (tx) => {
        await tx`savepoint s`;
        await expect(tx`select public.save_invoice_draft(${src2}, ${tx.json(hdr())}, ${tx.json(lines)})`).rejects.toThrow();
        await tx`rollback to savepoint s`;
      });
    }
  });

  it("logos bucket: members read their company folder, only owner/admin write, other companies see nothing", async () => {
    const path = `${tA}/${randomUUID()}.png`;
    await as(id.ownerA, async (tx) => {
      await tx`insert into storage.objects (bucket_id, name, owner_id) values ('logos', ${path}, ${id.ownerA})`;
      expect((await tx`select 1 from storage.objects where bucket_id = 'logos' and name = ${path}`).length).toBe(1);
      await tx`savepoint a`;
      await expect(tx`insert into storage.objects (bucket_id, name, owner_id) values ('logos', ${tB + "/x.png"}, ${id.ownerA})`).rejects.toThrow();
      await tx`rollback to savepoint a`;
    });
    // Same transaction, switching who is asking (rolled back at the end).
    await as(id.ownerA, async (tx) => {
      await tx`insert into storage.objects (bucket_id, name, owner_id) values ('logos', ${path}, ${id.ownerA})`;
      const asUser = (uid: string) => tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
      const seen = async () => (await tx`select 1 from storage.objects where bucket_id = 'logos' and name = ${path}`).length;
      await asUser(id.office);
      expect(await seen()).toBe(1); // members may read
      await tx`savepoint b`;
      await expect(tx`insert into storage.objects (bucket_id, name, owner_id) values ('logos', ${tA + "/y.png"}, ${id.office})`).rejects.toThrow(); // but not write
      await tx`rollback to savepoint b`;
      await asUser(id.ownerB);
      expect(await seen()).toBe(0);
    });
  });

  it("update_payment: owner/admin only, keeps the paid total within the invoice total, sent invoices only", async () => {
    const inv = (await sql`insert into public.invoices (tenant_id, customer_id, due_date, status) values (${tA}, ${custA}, '2099-01-01', 'draft') returning id`)[0].id;
    await sql`insert into public.invoice_lines (tenant_id, invoice_id, description, quantity, unit_price_cents) values (${tA}, ${inv}, 'Clean', 1, 10000)`;
    await as(id.ownerA, async (tx) => {
      await tx`select public.issue_invoice(${inv})`;
      const p1 = (await tx`select public.record_payment(${inv}, 4000, current_date, 'cash', null, null) as id`)[0].id;
      const p2 = (await tx`select public.record_payment(${inv}, 6000, current_date, 'check', '#1', null) as id`)[0].id;
      await tx`select public.update_payment(${p1}, 3000, current_date, 'zelle', 'ref', 'fixed')`;
      const [row] = await tx`select amount_cents, method, reference, notes from public.payments where id = ${p1}`;
      expect([row.amount_cents, row.method, row.reference, row.notes]).toEqual([3000, "zelle", "ref", "fixed"]);
      await tx`savepoint a`;
      await expect(tx`select public.update_payment(${p1}, 4001, current_date, 'cash', null, null)`).rejects.toThrow(/exceeds/);
      await tx`rollback to savepoint a`;
      await tx`select public.update_payment(${p2}, 6000, current_date, 'cash', null, null)`; // unchanged amount is fine
      // office staff can record payments but not edit them
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id.office, role: "authenticated" })}, true)`;
      await tx`savepoint b`;
      await expect(tx`select public.update_payment(${p1}, 100, current_date, 'cash', null, null)`).rejects.toThrow();
      await tx`rollback to savepoint b`;
    });
  });

  it("keeps the customer's phone on the invoice: a draft follows the customer, an issued invoice is frozen", async () => {
    await sql`update public.customers set phone = '555-0100' where id = ${custA}`;
    await as(id.office, async (tx) => {
      const inv = (await newInvoice(tx, id.office))[0].id;
      expect((await tx`select customer_phone from public.invoices where id = ${inv}`)[0].customer_phone).toBe("555-0100");
      await line(tx, inv, "Clean", 1, 5000);
      await tx`select public.issue_invoice(${inv})`;
      await tx`update public.customers set phone = '555-0199' where id = ${custA}`;
      await tx`update public.invoices set notes = 'x' where id = ${inv}`.catch(() => null);
      expect((await tx`select customer_phone from public.invoices where id = ${inv}`)[0].customer_phone).toBe("555-0100");
    });
  });
});
