import { addDays, addMonths, isIsoDate } from "@/lib/calendar";

export const RANGES = ["all", "this_month", "last_month", "this_year", "last_year", "custom"] as const;
export type Range = (typeof RANGES)[number];

export type PeriodParams = { range?: string; month?: string; year?: string; from?: string; to?: string };
export type Period = { mode: "all" | "month" | "year" | "custom"; range: Range; from: string; to: string; month: string; year: number };

const ALL_FROM = "2000-01-01";
const ALL_TO = "2100-12-31";
const monthPeriod = (month: string, range: Range): Period => ({ mode: "month", range, from: `${month}-01`, to: addDays(addMonths(`${month}-01`, 1), -1), month, year: Number(month.slice(0, 4)) });
const yearPeriod = (year: number, range: Range): Period => ({ mode: "year", range, from: `${year}-01-01`, to: `${year}-12-31`, month: `${year}-01`, year });

/**
 * Preset (`range`), a custom range (`from`/`to`), or the older `month` / `year` links.
 * Anything invalid falls back to `fallback` (the current month unless the report says otherwise).
 */
export function parsePeriod(sp: PeriodParams, today: string, fallback: Range = "this_month"): Period {
  if (isIsoDate(sp.from) && isIsoDate(sp.to) && sp.from <= sp.to && Date.parse(sp.to) - Date.parse(sp.from) <= 366 * 86_400_000 * 5) {
    return { mode: "custom", range: "custom", from: sp.from, to: sp.to, month: sp.from.slice(0, 7), year: Number(sp.from.slice(0, 4)) };
  }
  if (/^\d{4}$/.test(sp.year ?? "")) return yearPeriod(Number(sp.year), "custom");
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "")) return monthPeriod(sp.month!, "custom");
  const range = (RANGES as readonly string[]).includes(sp.range ?? "") && sp.range !== "custom" ? (sp.range as Range) : fallback === "custom" ? "this_month" : fallback;
  const thisMonth = today.slice(0, 7);
  const year = Number(today.slice(0, 4));
  switch (range) {
    case "all": return { mode: "all", range, from: ALL_FROM, to: ALL_TO, month: thisMonth, year };
    case "last_month": return monthPeriod(addMonths(`${thisMonth}-01`, -1).slice(0, 7), range);
    case "this_year": return yearPeriod(year, range);
    case "last_year": return yearPeriod(year - 1, range);
    default: return monthPeriod(thisMonth, "this_month");
  }
}

/** Query string that reproduces a period (used by the CSV and PDF links). */
export function periodQuery(p: Period): string {
  if (p.range === "custom") return p.mode === "custom" ? `from=${p.from}&to=${p.to}` : p.mode === "year" ? `year=${p.year}` : `month=${p.month}`;
  return `range=${p.range}`;
}
