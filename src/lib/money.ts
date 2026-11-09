/** Money helpers. Amounts are integer cents everywhere; text with commas/dollars is only for display and input. */

/** "1,250.50" / "$1250.5" → 125050. Returns null for empty or invalid input. */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  const cleaned = (input ?? "").replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [int, dec = ""] = cleaned.split(".");
  return Number(int) * 100 + Number(dec.padEnd(2, "0"));
}

export function formatMoney(cents: number | bigint | string | null | undefined, currency = "USD", locale = "en-US"): string {
  const n = Number(cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/** 12550 → "125.50" (value for a money input). */
export const centsToMoneyText = (cents: number | null | undefined): string => (cents == null ? "" : (cents / 100).toFixed(2));

/** Quote number as shown to people: prefix + zero-padded sequence ("Q-0042"). */
export const quoteNumber = (prefix: string, n: number): string => `${prefix}${String(n).padStart(4, "0")}`;
