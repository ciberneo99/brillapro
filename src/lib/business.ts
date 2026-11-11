type Place = { address: string | null; city: string | null; state: string | null; zip_code: string | null };

/** "Austin, TX 78745" from the separate fields (empty parts are skipped). */
export const cityLine = (s: Pick<Place, "city" | "state" | "zip_code">): string =>
  [s.city, [s.state, s.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/** Street + city line, on two lines, for documents that print the address as one block. */
export const fullAddress = (s: Place): string | null => [s.address, cityLine(s)].filter(Boolean).join("\n") || null;

/** Website as typed → "https://…" or null when empty; "invalid" when it isn't a web address. */
export function normalizeWebsite(input: string): string | null | "invalid" {
  const t = input.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return "invalid";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "invalid";
  }
}

/** Website without the scheme, for printing ("https://www.a.com" → "www.a.com"). */
export const displayUrl = (u: string): string => u.replace(/^https?:\/\//i, "");

/** Splits "7302 Plant Street, Austin, TX, 78745" into the street and the city line (two printed lines). */
export function addressLines(address: string | null | undefined): string[] {
  const a = (address ?? "").trim();
  if (!a) return [];
  if (a.includes("\n")) return a.split("\n").map((l) => l.trim()).filter(Boolean);
  const parts = a.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 3 ? [parts[0], parts.slice(1).join(", ")] : [a];
}
