import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";
import { InvoicePdf } from "@/modules/invoices/pdf";
import type { InvoiceDetail } from "@/modules/invoices/queries";
import { invoiceHeaderSchema, invoiceSettingsSchema, paymentSchema } from "@/modules/invoices/schema";

describe("invoice schemas", () => {
  const head = { issue_date: "2026-05-01", due_date: "2026-05-16", customer_name: "ann lee" };
  it("header normalizes and converts discount to cents", () => {
    const r = invoiceHeaderSchema.parse({ ...head, customer_email: " ANN@Test.CO ", discount: "5.5", tax_rate: "8.25", billing_address: "1 main st" });
    expect(r).toMatchObject({ customer_name: "Ann Lee", customer_email: "ann@test.co", discount_cents: 550, tax_rate: 8.25 });
  });
  it("header rejects a due date before the issue date, a bad email and a bad rate", () => {
    expect(invoiceHeaderSchema.safeParse({ ...head, due_date: "2026-04-01" }).success).toBe(false);
    expect(invoiceHeaderSchema.safeParse({ ...head, customer_email: "nope" }).success).toBe(false);
    expect(invoiceHeaderSchema.safeParse({ ...head, tax_rate: "101" }).success).toBe(false);
    expect(invoiceHeaderSchema.safeParse({ ...head, customer_name: " " }).success).toBe(false);
  });
  it("payment needs a positive amount and a known method", () => {
    expect(paymentSchema.parse({ amount: "1,250.50", paid_on: "2026-05-01", method: "zelle" })).toMatchObject({ amount: 125050, method: "zelle" });
    expect(paymentSchema.safeParse({ amount: "0", paid_on: "2026-05-01", method: "cash" }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: "", paid_on: "2026-05-01", method: "cash" }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: "5", paid_on: "2026-05-01", method: "bitcoin" }).success).toBe(false);
  });
  it("settings", () => {
    expect(invoiceSettingsSchema.parse({ invoice_prefix: "fac-", invoice_due_days: "30", invoice_terms: "" })).toMatchObject({ invoice_prefix: "FAC-", invoice_due_days: 30, invoice_terms: null });
    expect(invoiceSettingsSchema.safeParse({ invoice_due_days: "400" }).success).toBe(false);
  });
});

describe("invoice permissions", () => {
  it("office staff manage, accountant reads, manager and employee have none", () => {
    expect(can("office_staff", "invoices:write")).toBe(true);
    expect(can("accountant", "invoices:read")).toBe(true);
    expect(can("accountant", "invoices:write")).toBe(false);
    expect(can("manager", "invoices:read")).toBe(false);
    expect(can("employee", "invoices:read")).toBe(false);
  });
});

describe("invoice PDF", () => {
  const invoice: InvoiceDetail = {
    id: "1", number: 12, status: "sent", display_status: "partial", customer_id: "c", job_id: null, quote_id: null,
    issue_date: "2026-05-01", due_date: "2026-05-16", customer_name: "Ann Lee", customer_email: "a@b.co", customer_phone: null, billing_address: "1 Main St",
    discount_cents: 1000, tax_rate: 8, notes: "Thanks", terms: "Net 15", sent_at: null,
    lines: [{ id: "l1", description: "Deep clean", quantity: 1, unit_price_cents: 15000, position: 1 }, { id: "l2", description: "Oven", quantity: 2, unit_price_cents: 2500, position: 2 }],
    payments: [{ id: "p1", amount_cents: 5000, paid_on: "2026-05-03", method: "zelle", reference: "abc", notes: null }],
    totals: { subtotal_cents: 20000, discount_cents: 1000, tax_cents: 1520, total_cents: 20520, paid_cents: 5000, balance_cents: 15520 },
  };
  const business = { name: "Sunshine", phone: "555-000-1111", email: "s@x.co", address: "9 Oak Ave", tax_id: null };
  for (const locale of ["en", "es"] as const) {
    it(`renders a valid PDF (${locale})`, async () => {
      const buf = await renderToBuffer(
        createElement(InvoicePdf, { invoice, business, prefix: "INV-", currency: "USD", dateFormat: "MM/DD/YYYY", locale }) as Parameters<typeof renderToBuffer>[0],
      );
      expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(buf.length).toBeGreaterThan(1500);
    });
  }
});
