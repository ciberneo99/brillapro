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
