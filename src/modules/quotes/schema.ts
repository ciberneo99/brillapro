import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { normalizeName, normalizeSentences } from "@/lib/text";

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "expired"] as const;
export type QuoteDisplayStatus = (typeof QUOTE_STATUSES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sentence = (max: number) =>
  z.string().optional().transform((v) => normalizeSentences(v ?? "").trim()).pipe(z.string().max(max)).transform((v) => v || null);
const money = z.string().optional().transform((v, ctx) => {
  const t = (v ?? "").trim();
  if (t === "") return 0;
  const c = parseMoneyToCents(t);
  if (c == null || c > 99_999_999) { ctx.addIssue({ code: "custom", message: "money" }); return z.NEVER; }
  return c;
});

export const quoteHeaderSchema = z
  .object({
    title: z.string().optional().transform((v) => normalizeName(v ?? "").trim()).pipe(z.string().max(120)).transform((v) => v || null),
    service_type_id: z.string().optional().transform((v) => (v && v !== "" ? v : null)).pipe(z.string().uuid().nullable()),
    issue_date: isoDate,
    expires_on: isoDate,
    discount: money,
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
  .refine((v) => v.expires_on >= v.issue_date, { path: ["expires_on"], message: "dates" })
  .transform(({ discount, ...rest }) => ({ ...rest, discount_cents: discount }));

export const optionSchema = z
  .object({
    name: z.string().transform((v) => normalizeName(v).trim()).pipe(z.string().min(1).max(80)),
    description: sentence(1000),
    price: money,
  })
  .transform(({ price, ...rest }) => ({ ...rest, base_price_cents: price }));

export const lineSchema = z
  .object({
    description: z.string().transform((v) => normalizeSentences(v).trim()).pipe(z.string().min(1).max(200)),
    quantity: z.string().optional().transform((v, ctx) => {
      const n = Number((v ?? "1").trim() || "1");
      if (!Number.isFinite(n) || n <= 0 || n > 99999) { ctx.addIssue({ code: "custom", message: "qty" }); return z.NEVER; }
      return Math.round(n * 100) / 100;
    }),
    price: money,
  })
  .transform(({ price, ...rest }) => ({ ...rest, unit_price_cents: price }));

export const settingsSchema = z.object({
  quote_prefix: z.string().optional().transform((v) => (v ?? "").trim().toUpperCase()).pipe(z.string().max(10)),
  quote_valid_days: z.coerce.number().int().min(1).max(365),
  default_tax_rate: z.string().optional().transform((v, ctx) => {
    const n = Number((v ?? "0").replace(/%/g, "").trim() || "0");
    if (!Number.isFinite(n) || n < 0 || n > 100) { ctx.addIssue({ code: "custom", message: "rate" }); return z.NEVER; }
    return Math.round(n * 100) / 100;
  }),
  quote_terms: sentence(3000),
});

/** Default option names for "Good / Better / Best". */
export const TIERS = ["Good", "Better", "Best"] as const;

export type QuoteTotals = { option_id: string | null; subtotal_cents: number; discount_cents: number; tax_cents: number; total_cents: number };
