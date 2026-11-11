import { addDays, addMonths, isIsoDate } from "@/lib/calendar";

export type PeriodParams = { month?: string; year?: string; from?: string; to?: string };
export type Period = { mode: "month" | "year" | "custom"; from: string; to: string; month: string; year: number };

/** Month (default), whole year, or a custom range. Anything invalid falls back to the current month. */
export function parsePeriod(sp: PeriodParams, today: string): Period {
  const thisMonth = today.slice(0, 7);
  if (isIsoDate(sp.from) && isIsoDate(sp.to) && sp.from <= sp.to && Date.parse(sp.to) - Date.parse(sp.from) <= 366 * 86_400_000 * 5) {
    return { mode: "custom", from: sp.from, to: sp.to, month: sp.from.slice(0, 7), year: Number(sp.from.slice(0, 4)) };
  }
  if (/^\d{4}$/.test(sp.year ?? "")) return { mode: "year", from: `${sp.year}-01-01`, to: `${sp.year}-12-31`, month: `${sp.year}-01`, year: Number(sp.year) };
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? sp.month! : thisMonth;
  return { mode: "month", from: `${month}-01`, to: addDays(addMonths(`${month}-01`, 1), -1), month, year: Number(month.slice(0, 4)) };
}

/** Query string that reproduces a period (used by the CSV link and the nav arrows). */
export function periodQuery(p: Period): string {
  return p.mode === "custom" ? `from=${p.from}&to=${p.to}` : p.mode === "year" ? `year=${p.year}` : `month=${p.month}`;
}
