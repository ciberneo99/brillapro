import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { normalizeAddress, normalizeName, normalizeSentences } from "@/lib/text";
import { isValidEmail, sanitizeEmail } from "@/lib/email";

export const INVOICE_STATUSES = ["draft", "sent", "partial", "paid", "overdue", "void"] as const;
export const PAYMENT_METHODS = ["cash", "check", "card", "zelle", "venmo", "bank_transfer", "other"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sentence = (max: number) =>
  z.string().optional().transform((v) => normalizeSentences(v ?? "").trim()).pipe(z.string().max(max)).transform((v) => v || null);
const money = (required = false) =>
  z.string().optional().transform((v, ctx) => {
    const t = (v ?? "").trim();
    if (t === "") {
      if (required) { ctx.addIssue({ code: "custom", message: "money" }); return z.NEVER; }
      return 0;
    }
    const c = parseMoneyToCents(t);
    if (c == null || c > 99_999_999) { ctx.addIssue({ code: "custom", message: "money" }); return z.NEVER; }
    return c;
  });

export const invoiceHeaderSchema = z
  .object({
    issue_date: isoDate,
    due_date: isoDate,
    customer_name: z.string().transform((v) => normalizeName(v).trim()).pipe(z.string().min(1).max(160)),
    customer_email: z.string().optional().transform((v) => sanitizeEmail(v ?? "")).refine((v) => v === "" || isValidEmail(v)).transform((v) => v || null),
    billing_address: z.string().optional().transform((v) => normalizeAddress(v ?? "").trim()).pipe(z.string().max(300)).transform((v) => v || null),
    discount: money(),
    tax_rate: z.string().optional().transform((v, ctx) => {
      const t = (v ?? "").trim().replace(/%/g, "");
      if (t === "") return 0;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0 || n > 100) { ctx.addIssue({ code: "custom", message: "rate" }); return z.NEVER; }
      return Math.round(n * 100) / 100;
    }),
    notes: sentence(2000),
    terms: sentence(3000),
  })
  .refine((v) => v.due_date >= v.issue_date, { path: ["due_date"], message: "dates" })
  .transform(({ discount, ...rest }) => ({ ...rest, discount_cents: discount }));

export const paymentSchema = z
  .object({
    amount: money(true),
    paid_on: isoDate,
    method: z.string().regex(/^[a-z0-9_]{1,40}$/),
    reference: z.string().optional().transform((v) => (v ?? "").trim()).pipe(z.string().max(120)),
    notes: sentence(500),
  })
  .refine((v) => v.amount > 0, { path: ["amount"], message: "money" });

export const invoiceSettingsSchema = z.object({
  invoice_prefix: z.string().optional().transform((v) => (v ?? "").trim().toUpperCase()).pipe(z.string().max(10)),
  invoice_due_days: z.coerce.number().int().min(0).max(365),
  invoice_terms: sentence(3000),
});

export type InvoiceTotals = {
  subtotal_cents: number; discount_cents: number; tax_cents: number; total_cents: number; paid_cents: number; balance_cents: number;
};
