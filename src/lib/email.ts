/** Email fields accept only a valid address shape: lowercase, no spaces, one "@". */

/** Cleans input as the person types. */
export function sanitizeEmail(input: string): string {
  const cleaned = input.toLowerCase().replace(/[^a-z0-9._%+@-]/g, "");
  const at = cleaned.indexOf("@");
  if (at === -1) return cleaned;
  return cleaned.slice(0, at + 1) + cleaned.slice(at + 1).replace(/@/g, "");
}

/** Local part, "@", then a domain with at least one dot and a 2+ letter ending. */
export const EMAIL_PATTERN = "[a-z0-9._%+\\-]+@[a-z0-9\\-]+(\\.[a-z0-9\\-]+)*\\.[a-z]{2,}";
const EMAIL_RE = new RegExp(`^${EMAIL_PATTERN}$`);

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value) && !value.includes("..") && !value.startsWith(".") && !value.includes(".@");
}
