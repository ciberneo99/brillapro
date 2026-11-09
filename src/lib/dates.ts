/** Date display. The company chooses the pattern in Settings (default MM/DD/YYYY, the US format). */

export type DateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
export const DEFAULT_DATE_FORMAT: DateFormat = "MM/DD/YYYY";

export function isDateFormat(v: unknown): v is DateFormat {
  return v === "MM/DD/YYYY" || v === "DD/MM/YYYY" || v === "YYYY-MM-DD";
}

function layout(y: string, m: string, d: string, fmt: DateFormat): string {
  if (fmt === "DD/MM/YYYY") return `${d}/${m}/${y}`;
  if (fmt === "YYYY-MM-DD") return `${y}-${m}-${d}`;
  return `${m}/${d}/${y}`;
}

/** A calendar date with no time ("2026-05-01"). Never shifted by time zones. */
export function formatDateOnly(iso: string | null | undefined, fmt: string = DEFAULT_DATE_FORMAT): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  return layout(m[1], m[2], m[3], isDateFormat(fmt) ? fmt : DEFAULT_DATE_FORMAT);
}

/** A moment in time (timestamptz), shown as a date in the company's time zone. */
export function formatTimestamp(value: string | Date, fmt: string = DEFAULT_DATE_FORMAT, timeZone = "America/New_York"): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return layout(get("year"), get("month"), get("day"), isDateFormat(fmt) ? fmt : DEFAULT_DATE_FORMAT);
}

/** A local Date object (from the date picker) in the company's pattern. */
export function formatLocalDate(d: Date, fmt: string = DEFAULT_DATE_FORMAT): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return layout(String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()), isDateFormat(fmt) ? fmt : DEFAULT_DATE_FORMAT);
}
