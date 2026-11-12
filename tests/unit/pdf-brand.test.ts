import { inflateSync } from "node:zlib";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InvoicePdf } from "@/modules/invoices/pdf";
import { QuotePdf } from "@/modules/quotes/pdf";
import type { InvoiceDetail } from "@/modules/invoices/queries";
import type { QuoteDetail } from "@/modules/quotes/queries";

/** Everything the PDF draws, decompressed, so colors can be looked for as text. */
function content(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  let out = "";
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try { out += inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"); } catch { /* images and fonts are not plain text */ }
  }
  return out;
}
const rg = (hex: string) => [1, 3, 5].map((i) => String(parseInt(hex.slice(i, i + 2), 16) / 255)).join(" ");

const business = { name: "Acme Cleaning", phone: "512-555-0100", email: "a@b.com", address: "1 Main St", tax_id: null };
const invoice = {
  id: "i", number: 7, status: "sent", display_status: "sent", customer_id: "c", job_id: null, quote_id: null, issue_date: "2026-01-01", due_date: "2026-01-15",
  customer_name: "Jane Doe", customer_email: null, customer_phone: null, billing_address: null, discount_cents: 0, tax_rate: 0, notes: null, terms: null, sent_at: null,
  lines: [{ id: "l", description: "Standard clean", quantity: 1, unit_price_cents: 22000, position: 1 }], payments: [],
  totals: { subtotal_cents: 22000, discount_cents: 0, tax_cents: 0, total_cents: 22000, paid_cents: 0, balance_cents: 22000 },
} as unknown as InvoiceDetail;
const quote = {
  id: "q", number: 3, status: "draft", display_status: "draft", customer_id: "c", service_type_id: null, title: null, issue_date: "2026-01-01", expires_on: "2026-02-01",
  discount_cents: 0, tax_rate: 0, selected_option_id: null, notes: null, terms: null, sent_at: null, responded_at: null,
  customer: { first_name: "Jane", last_name: "Doe", company_name: "", email: null, phone: null, service_address: null, city: null, state: null, zip_code: null },
  serviceName: null, options: [{ id: "o", name: "Standard Clean", description: null, base_price_cents: 22000, position: 1 }], lines: [],
  totals: [{ option_id: "o", subtotal_cents: 22000, discount_cents: 0, tax_cents: 0, total_cents: 22000 }],
} as unknown as QuoteDetail;
const base = { business, prefix: "INV-", currency: "USD", dateFormat: "MM/DD/YYYY", locale: "en" as const };

const logo = async () => ({ data: await sharp({ create: { width: 300, height: 120, channels: 3, background: "#1d4ed8" } }).png().toBuffer(), format: "png" as const });

describe("invoice and quote PDFs follow the brand", () => {
  it("draw the table header and title in the brand color, and the default green without one", async () => {
    const branded = content(await renderToBuffer(createElement(InvoicePdf, { ...base, invoice, brand: "#1d4ed8", logoSize: "large", logo: await logo() }) as never));
    expect(branded).toContain(rg("#1d4ed8"));
    const plain = content(await renderToBuffer(createElement(InvoicePdf, { ...base, invoice }) as never));
    expect(plain).toContain(rg("#0b7a75"));
    expect(plain).not.toContain(rg("#1d4ed8"));
  });

  it("do the same for quotes", async () => {
    const branded = content(await renderToBuffer(createElement(QuotePdf, { ...base, prefix: "Q-", quote, brand: "#7c3aed", logoSize: "small", logo: await logo() }) as never));
    expect(branded).toContain(rg("#7c3aed"));
    expect(branded).not.toContain(rg("#0b7a75"));
  });

  it("render with every logo size", async () => {
    for (const logoSize of ["small", "medium", "large"] as const) {
      const pdf = await renderToBuffer(createElement(InvoicePdf, { ...base, invoice, logoSize, logo: await logo() }) as never);
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    }
  });
});
