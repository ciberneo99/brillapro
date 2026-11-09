import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { normalizeName, normalizeSentences } from "@/lib/text";

export const EXPENSE_METHODS = ["cash", "check", "card", "zelle", "venmo", "bank_transfer", "other"] as const;
export const RECEIPT_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

export const expenseSchema = z
  .object({
    category_id: z.string().uuid(),
    job_id: z.string().optional().transform((v) => (v ? v : null)).pipe(z.string().uuid().nullable()),
    vendor: z.string().optional().transform((v) => normalizeName(v ?? "").trim()).pipe(z.string().max(120)),
    description: z.string().optional().transform((v) => normalizeSentences(v ?? "").trim()).pipe(z.string().max(500)).transform((v) => v || null),
    amount: z.string().transform((v, ctx) => {
      const c = parseMoneyToCents(v);
      if (c == null || c <= 0 || c > 99_999_999) { ctx.addIssue({ code: "custom", message: "money" }); return z.NEVER; }
      return c;
    }),
    expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    payment_method: z.string().optional().transform((v) => (v ? v : null)).pipe(z.enum(EXPENSE_METHODS).nullable()),
  })
  .transform(({ amount, ...rest }) => ({ ...rest, amount_cents: amount }));

/** Checks an uploaded receipt file; returns its extension or an error code. */
export function checkReceipt(file: { type: string; size: number }): { ext: string } | { error: "type" | "size" } {
  const ext = RECEIPT_TYPES[file.type];
  if (!ext) return { error: "type" };
  if (file.size > RECEIPT_MAX_BYTES) return { error: "size" };
  return { ext };
}

export const categorySchema = z.object({
  name: z.string().transform((v) => normalizeName(v).trim()).pipe(z.string().min(1).max(80)),
});
