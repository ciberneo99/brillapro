import { parseMoneyToCents } from "@/lib/money";

/** Same arithmetic as the database function invoice_totals(): lines rounded to cents, discount capped at the subtotal, tax on the rest. */
export function computeTotals(lines: { quantity: number; unit_price_cents: number }[], discountCents: number, taxRate: number) {
  const subtotal = lines.reduce((a, l) => a + Math.round(l.quantity * l.unit_price_cents), 0);
  const discount = Math.min(Math.max(discountCents, 0), subtotal);
  const tax = Math.round(((subtotal - discount) * taxRate) / 100);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

/** Typed text → numbers for the live preview (invalid text counts as 0; the server validates on save). */
export const textToQty = (v: string): number => {
  const n = Number(v.trim() || "0");
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
export const textToCents = (v: string): number => parseMoneyToCents(v) ?? 0;

/** Moves one item from index `from` to index `to` (returns a new array). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
