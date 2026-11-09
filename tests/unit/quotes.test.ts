import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { formatMoney, parseMoneyToCents, quoteNumber } from "@/lib/money";
import { lineSchema, optionSchema, quoteHeaderSchema, settingsSchema } from "@/modules/quotes/schema";
import { QuotePdf } from "@/modules/quotes/pdf";
import type { QuoteDetail } from "@/modules/quotes/queries";

describe("money", () => {
  it("parses typed amounts to cents", () => {
    expect(parseMoneyToCents("1,250.5")).toBe(125050);
    expect(parseMoneyToCents("$99")).toBe(9900);
    expect(parseMoneyToCents("0.07")).toBe(7);
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("1.234")).toBeNull();
    expect(parseMoneyToCents("")).toBeNull();
  });
  it("formats and numbers", () => {
    expect(formatMoney(125050)).toBe("$1,250.50");
    expect(quoteNumber("Q-", 42)).toBe("Q-0042");
  });
});

describe("quote schemas", () => {
  const header = { issue_date: "2026-05-01", expires_on: "2026-05-31" };
  it("header: dollars become cents, defaults are safe", () => {
    const r = quoteHeaderSchema.parse({ ...header, discount: "10.50", tax_rate: "8.255%", title: "deep clean main st", notes: "" });
    expect(r.discount_cents).toBe(1050);
    expect(r.tax_rate).toBe(8.26);
    expect(r.title).toBe("Deep Clean Main St");
    expect(r.notes).toBeNull();
    expect(r.service_type_id).toBeNull();
  });
  it("header rejects bad rates, money and reversed dates", () => {
    expect(quoteHeaderSchema.safeParse({ ...header, tax_rate: "120" }).success).toBe(false);
    expect(quoteHeaderSchema.safeParse({ ...header, discount: "-5" }).success).toBe(false);
    expect(quoteHeaderSchema.safeParse({ issue_date: "2026-06-01", expires_on: "2026-05-01" }).success).toBe(false);
    expect(quoteHeaderSchema.safeParse({ ...header, expires_on: "05/31/2026" }).success).toBe(false);
  });
  it("option and line", () => {
    expect(optionSchema.parse({ name: "good", price: "150" })).toMatchObject({ name: "Good", base_price_cents: 15000 });
    expect(optionSchema.safeParse({ name: "  ", price: "1" }).success).toBe(false);
    expect(lineSchema.parse({ description: "oven", quantity: "2", price: "25" })).toMatchObject({ quantity: 2, unit_price_cents: 2500 });
    expect(lineSchema.safeParse({ description: "x", quantity: "0", price: "1" }).success).toBe(false);
  });
  it("settings", () => {
    const r = settingsSchema.parse({ quote_prefix: "est-", quote_valid_days: "15", default_tax_rate: "7", quote_terms: "" });
    expect(r).toMatchObject({ quote_prefix: "EST-", quote_valid_days: 15, default_tax_rate: 7, quote_terms: null });
    expect(settingsSchema.safeParse({ quote_valid_days: "0", default_tax_rate: "0" }).success).toBe(false);
  });
});

describe("quote PDF", () => {
  const quote: QuoteDetail = {
    id: "1", number: 7, status: "sent", display_status: "sent", customer_id: "c", service_type_id: null, title: "Deep clean",
    issue_date: "2026-05-01", expires_on: "2026-05-31", discount_cents: 1000, tax_rate: 8, selected_option_id: null, notes: "Bring pets out", terms: "Terms",
    sent_at: null, responded_at: null,
    customer: { first_name: "Ann", last_name: "Lee", company_name: "", email: "a@b.co", phone: "555-111-2222", service_address: "1 Main St", city: "Austin", state: "Texas", zip_code: "78701" },
    serviceName: "Deep Cleaning",
    options: [
      { id: "o1", name: "Good", description: "Basics", base_price_cents: 10000, position: 1 },
      { id: "o2", name: "Better", description: null, base_price_cents: 15000, position: 2 },
    ],
    lines: [{ id: "l1", description: "Oven", quantity: 2, unit_price_cents: 2500, position: 1 }],
    totals: [
      { option_id: "o1", subtotal_cents: 15000, discount_cents: 1000, tax_cents: 1120, total_cents: 15120 },
      { option_id: "o2", subtotal_cents: 20000, discount_cents: 1000, tax_cents: 1520, total_cents: 20520 },
    ],
  };
  const business = { name: "Sunshine", phone: "555-000-1111", email: "s@x.co", address: "9 Oak Ave", tax_id: null };

  for (const locale of ["en", "es"] as const) {
    it(`renders a valid PDF (${locale})`, async () => {
      const buf = await renderToBuffer(
        createElement(QuotePdf, { quote, business, prefix: "Q-", currency: "USD", dateFormat: "MM/DD/YYYY", locale }) as Parameters<typeof renderToBuffer>[0],
      );
      expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(buf.length).toBeGreaterThan(1500);
    });
  }
});
