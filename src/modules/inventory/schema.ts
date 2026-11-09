import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { normalizeName } from "@/lib/text";

export const MOVEMENT_KINDS = ["purchase", "use", "adjust_add", "adjust_remove"] as const;

/** Positive quantity with up to 2 decimals ("1,250.5" → 1250.5), or null. */
export function parseQuantity(input: string | null | undefined): number | null {
  const t = (input ?? "").replace(/,/g, "").trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

const qty = (allowZero: boolean) =>
  z.string().optional().transform((v, ctx) => {
    if (allowZero && !(v ?? "").trim()) return 0;
    const n = parseQuantity(v);
    if (n == null) { ctx.addIssue({ code: "custom", message: "quantity" }); return z.NEVER; }
    return n;
  });

export const itemSchema = z.object({
  name: z.string().transform((v) => normalizeName(v).trim()).pipe(z.string().min(1).max(120)),
  unit: z.string().optional().transform((v) => (v ?? "").trim().toLowerCase() || "unit").pipe(z.string().max(30)),
  min_quantity: qty(true),
  unit_cost: z.string().optional().transform((v, ctx) => {
    if (!(v ?? "").trim()) return null;
    const c = parseMoneyToCents(v);
    if (c == null || c < 0 || c > 99_999_999) { ctx.addIssue({ code: "custom", message: "money" }); return z.NEVER; }
    return c;
  }),
  notes: z.string().optional().transform((v) => (v ?? "").trim().slice(0, 500) || null),
}).transform(({ unit_cost, ...r }) => ({ ...r, unit_cost_cents: unit_cost }));

export const movementSchema = z.object({
  kind: z.enum(MOVEMENT_KINDS),
  quantity: qty(false),
  job_id: z.string().optional().transform((v) => (v ? v : null)).pipe(z.string().uuid().nullable()),
  note: z.string().optional().transform((v) => (v ?? "").trim().slice(0, 300) || null),
  movement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).transform((m) => {
  const sign = m.kind === "use" || m.kind === "adjust_remove" ? -1 : 1;
  const kind = m.kind === "purchase" ? "purchase" : m.kind === "use" ? "use" : "adjustment";
  return { kind, quantity: sign * m.quantity, job_id: kind === "use" ? m.job_id : null, note: m.note, movement_date: m.movement_date };
});

export const hoursText = (seconds: number) => `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m`;
