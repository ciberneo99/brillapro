// Pure helpers for the AI receipt reader: the shape the model must return and how its answer is checked.
// Whatever the model says is only a suggestion: dates, amounts and categories are validated here before they reach the form.
import { z } from "zod";
import { centsToMoneyText, parseMoneyToCents } from "@/lib/money";
import { normalizeName } from "@/lib/text";

export const ReceiptReading = z.object({
  vendor: z.string().describe("Store or merchant name as printed on the receipt. Empty string if unreadable."),
  date: z.string().describe("Purchase date as YYYY-MM-DD. Empty string if not visible."),
  total: z.string().describe("Final total paid, including tax and tip, as a plain decimal like 45.67 with no currency symbol. Empty string if not visible."),
  category: z.string().describe("Exactly one name from the provided category list, or an empty string if none fits clearly."),
});
export type ReceiptReadingRaw = z.infer<typeof ReceiptReading>;

export type ReceiptSuggestion = { vendor: string | null; date: string | null; amount: string | null; category_id: string | null };

/** Turns the model's raw answer into safe form values. Anything doubtful becomes null (the person fills it in). */
export function interpretReading(
  raw: ReceiptReadingRaw,
  categories: { id: string; name: string }[],
  today: string,
): ReceiptSuggestion {
  const vendor = normalizeName(raw.vendor.trim()).slice(0, 120) || null;

  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.date.trim());
  const valid = d && new Date(`${raw.date.trim()}T00:00:00Z`).toISOString().slice(0, 10) === raw.date.trim();
  const date = valid && raw.date.trim() <= today && Number(d[1]) >= 2000 ? raw.date.trim() : null;

  const cents = raw.total.includes("-") ? null : parseMoneyToCents(raw.total.replace(/[^\d.,]/g, ""));
  const amount = cents !== null && cents > 0 && cents <= 99_999_999 ? centsToMoneyText(cents) : null;

  const wanted = raw.category.trim().toLowerCase();
  const category_id = wanted ? categories.find((c) => c.name.trim().toLowerCase() === wanted)?.id ?? null : null;

  return { vendor, date, amount, category_id };
}

export const hasSuggestion = (s: ReceiptSuggestion) => Boolean(s.vendor || s.date || s.amount || s.category_id);
