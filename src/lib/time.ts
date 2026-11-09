/** "14:30" / "14:30:00" → "2:30 PM" (US display). Empty/invalid → "". */
export function formatTime(value: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  if (h > 23) return "";
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Normalizes a form time ("9:05", "09:05:00") to "HH:MM", or null when empty/invalid. */
export function parseTime(value: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((value ?? "").trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** Milliseconds → "2h 05m" (or "45m"). */
export function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = String(mins % 60).padStart(2, "0");
  return h > 0 ? `${h}h ${m}m` : `${mins}m`;
}

/** A timestamp as a wall-clock time in the company's time zone ("2:30 PM"). */
export function formatClock(value: string | Date | null | undefined, timeZone = "America/New_York"): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
  }
}
