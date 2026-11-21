const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Milliseconds the zone is ahead of UTC at that instant (negative west of Greenwich). */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - Math.floor(utcMs / 1000) * 1000;
}

/** The moment a task due on `dueIso` (YYYY-MM-DD) runs out: the end of that day in the company's time zone. */
export function dueInstant(dueIso: string, timeZone: string): number {
  const [y, m, d] = dueIso.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d + 1, 0, 0, 0); // midnight at the end of the due day, read as UTC
  const first = guess - zoneOffsetMs(guess, timeZone);
  return guess - zoneOffsetMs(first, timeZone); // second pass settles daylight-saving changes
}

export type TimeLeft = { kind: "days" | "hours" | "minutes" | "overdueDays" | "overdueHours" | "overdueMinutes"; count: number };

/** "3 days", then "5 hours" once less than a day is left, then minutes. Past the due moment it counts how long it is overdue. */
export function timeLeft(now: number, due: number): TimeLeft {
  const diff = due - now;
  const abs = Math.abs(diff);
  const over = diff < 0;
  if (abs >= DAY) return { kind: over ? "overdueDays" : "days", count: Math.floor(abs / DAY) };
  if (abs >= HOUR) return { kind: over ? "overdueHours" : "hours", count: Math.floor(abs / HOUR) };
  return { kind: over ? "overdueMinutes" : "minutes", count: Math.max(1, Math.floor(abs / 60_000)) };
}

/** Share of the time between creating the task and its deadline that has already gone by, from 0 to 1. */
export function elapsedShare(now: number, created: number, due: number): number {
  if (due <= created) return 1;
  return Math.min(1, Math.max(0, (now - created) / (due - created)));
}

/** Bar colour: calm while there is time, amber in the last 3 days, red in the last day or when overdue. */
export function urgency(now: number, due: number): "ok" | "soon" | "urgent" {
  const left = due - now;
  return left <= DAY ? "urgent" : left <= 3 * DAY ? "soon" : "ok";
}
