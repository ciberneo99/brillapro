/** US ZIP codes: 12345 or 12345-6789. */

/** Live typing: digits only, hyphen inserted after the 5th digit. */
export function formatZipTyping(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 9);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/** Server: "" → null, 5 or 9 digits → canonical form, anything else → "invalid". */
export function normalizeZip(input: string): string | null | "invalid" {
  const digits = input.replace(/\D/g, "");
  if (input.trim() === "") return null;
  if (digits.length === 5) return digits;
  if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return "invalid";
}
