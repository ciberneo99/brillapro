/** US-style phone formatting: 5551234567 → 555-123-4567. Pure functions shared by the UI and the server. */

const INTERNATIONAL = /^\s*\+(?!1(?:\D|$))/; // "+52 …", "+44 …" are left alone; "+1 …" is treated as US

/** Live formatting while typing (partial numbers are formatted progressively). */
export function formatPhone(input: string): string {
  if (INTERNATIONAL.test(input)) return input.slice(0, 40);
  let digits = input.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1); // leading country code
  digits = digits.slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Server-side normalization: complete 10-digit numbers become xxx-xxx-xxxx; anything else is kept as typed. */
export function normalizePhone(input: string): string {
  const raw = input.trim();
  if (INTERNATIONAL.test(raw)) return raw;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? formatPhone(digits) : raw;
}
