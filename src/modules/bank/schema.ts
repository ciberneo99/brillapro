import { z } from "zod";

export const MAX_PDF_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;

const text = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().uuid();

export const categorySchema = z.object({
  name: text(80),
  keywords: z.string().trim().max(500).default(""),
  parentId: id.nullable().default(null),
});

export const importRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: text(300),
  amountCents: z.number().int().refine((n) => n !== 0 && Math.abs(n) < 100_000_000_000),
  balanceCents: z.number().int().nullable(),
  categoryId: id.nullable(),
  n: z.number().int().min(0).max(5000),
});
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int().refine((n) => Math.abs(n) < 100_000_000_000);
export const statementSchema = z.object({ beginningCents: cents.nullable(), endingCents: cents.nullable(), periodStart: isoDate, periodEnd: isoDate })
  .refine((s) => s.periodEnd >= s.periodStart && (s.beginningCents !== null || s.endingCents !== null));
export const importSchema = z.object({
  source: z.string().trim().max(200).default(""),
  rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS),
  statement: statementSchema.nullable().default(null),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const editSchema = z.object({
  tx_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: text(300),
  category_id: id.nullable(),
});

/** Money typed by a person ("1,234.56") into cents; null when invalid. */
export const toCents = (s: string): number | null => {
  const m = /^\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?\s*$/.exec(s);
  return m ? Number(m[1].replace(/,/g, "")) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0) : null;
};
