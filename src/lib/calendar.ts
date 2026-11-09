/** Calendar date math on ISO strings ("2026-05-01"), done in UTC so time zones never shift a day. Weeks start on Sunday (US). */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v));

const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/** Sunday on or before the date. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -parse(iso).getUTCDay());
}

export function addMonths(iso: string, n: number): string {
  const d = parse(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toIso(d);
}

export const weekDays = (iso: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(iso), i));

/** Weeks (rows of 7 ISO dates, Sunday first) that cover the month containing `iso`. */
export function monthGrid(iso: string): string[][] {
  const first = `${iso.slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const weeks: string[][] = [];
  for (let s = startOfWeek(first); s <= last; s = addDays(s, 7)) weeks.push(weekDays(s));
  return weeks;
}

/** Today's date in the given IANA time zone. */
export function todayIso(timeZone = "America/New_York", now = new Date()): string {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    return ISO.test(p) ? p : toIso(now);
  } catch {
    return toIso(now);
  }
}
