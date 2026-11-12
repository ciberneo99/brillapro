// How the importer learns from the company's own choices: a merchant word per bank line, and a vote count per category.

/** Words banks put in front of (or around) the merchant name. They say nothing about who was paid. */
const NOISE = new Set([
  "pos", "debit", "credit", "purchase", "purch", "card", "checkcard", "check", "visa", "mastercard", "mc", "ach", "web", "pmt", "payment", "pymt", "recurring",
  "recur", "online", "transfer", "xfer", "withdrawal", "deposit", "authorized", "auth", "on", "the", "of", "to", "from", "for", "and", "inc", "llc", "co", "corp",
  "id", "ref", "tst", "sq", "paypal", "zelle", "venmo", "pending", "terminal", "atm", "bill", "pay", "dda", "fee", "tx", "ca", "fl", "ny", "nv", "az", "nm", "ok", "la",
]);

/** The merchant word(s) of a bank line ("POS DEBIT 03/12 WHATABURGER #1234 AUSTIN TX" → "whataburger"), or null when nothing useful is left. */
export function merchantKey(description: string): string | null {
  const words = description
    .toLowerCase()
    .replace(/[*#:/]+/g, " ")
    .replace(/[^a-z0-9&' .-]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-z]+|[^a-z]+$/g, ""))
    .filter((w) => w.length >= 2 && !/\d/.test(w) && !NOISE.has(w));
  if (!words.length) return null;
  const key = words[0].length >= 6 ? words[0] : words.slice(0, 2).join(" ");
  return key.length >= 2 ? key.slice(0, 60) : null;
}

/** The category the company has chosen most for a merchant. A tie is no answer: it asks to be settled by one more choice. */
export function pickLearned(votes: { category_id: string; hits: number }[]): string | null {
  const sorted = [...votes].sort((a, b) => b.hits - a.hits);
  if (!sorted.length || sorted[0].hits < 1) return null;
  if (sorted[1] && sorted[1].hits === sorted[0].hits) return null;
  return sorted[0].category_id;
}
