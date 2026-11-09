/** Helpers for money / grouped-number text fields. Values are displayed with commas; the server strips them. */

/** "1250" → "1,250"; digits only, up to `max` digits. */
export function groupInteger(input: string, max = 9): string {
  const digits = input.replace(/\D/g, "").slice(0, max).replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Live money typing: digits, one dot, at most 2 decimals, thousands separators. "1250.5" → "1,250.5". */
export function formatMoneyTyping(input: string): string {
  const cleaned = input.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return groupInteger(cleaned, 7);
  const int = groupInteger(cleaned.slice(0, dot), 7);
  const dec = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${int || "0"}.${dec}`;
}

/** On leaving the field: always two decimals ("1,250" → "1,250.00"); empty stays empty. */
export function formatMoneyFinal(input: string): string {
  const typed = formatMoneyTyping(input);
  if (typed === "" || typed === "0." || typed === ".") return "";
  const [int, dec = ""] = typed.split(".");
  return `${int || "0"}.${dec.padEnd(2, "0")}`;
}
