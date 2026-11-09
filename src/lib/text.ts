/** Auto-capitalization for names and addresses.
 *  Rule: raise the FIRST letter of each word; never lower the rest ("McDonald", "NW", "PO Box" stay as typed). */

/** Safe to run on every keystroke (does not trim or collapse spaces, so typing flows naturally). */
export function capitalizeWords(input: string): string {
  return input
    // first letter after start / space / hyphen / slash / "(" / comma
    .replace(/(^|[\s\-/(,])(\p{Ll})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    // one-letter prefixes: o'brien → O'Brien, d'angelo → D'Angelo (but john's stays John's)
    .replace(/(^|[\s\-/(,])(\p{L})(['’])(\p{Ll})/gu, (_, sep: string, a: string, q: string, b: string) => sep + a + q + b.toUpperCase());
}

const squash = (v: string) => v.replace(/\s+/g, " ").trim();

/** Final form for names and street/city text: single spaces, trimmed, first letters raised. */
export function normalizeName(input: string): string {
  return capitalizeWords(squash(input));
}
export const normalizeAddress = normalizeName;

/** "tx" → "TX"; "texas" → "Texas". (Applied on blur / on the server, not per keystroke.) */
export function normalizeState(input: string): string {
  const v = squash(input);
  return /^\p{L}{2}$/u.test(v) ? v.toUpperCase() : capitalizeWords(v);
}

/** Free text (notes, instructions): raise the first letter of each sentence; never lower anything. */
export function capitalizeSentences(input: string): string {
  return input.replace(/(^|[.!?]\s+|\n\s*)(\p{Ll})/gu, (_, lead: string, ch: string) => lead + ch.toUpperCase());
}
/** Final form: trimmed, line breaks kept, sentence starts raised. */
export function normalizeSentences(input: string): string {
  return capitalizeSentences(input.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim());
}

export type TextMode = "name" | "address" | "state" | "sentence";
export const liveFormat = (mode: TextMode, v: string) => (mode === "sentence" ? capitalizeSentences(v) : capitalizeWords(v));
export const finalFormat = (mode: TextMode, v: string) =>
  mode === "state" ? normalizeState(v) : mode === "sentence" ? normalizeSentences(v) : normalizeName(v);
