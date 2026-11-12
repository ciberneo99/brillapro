import { parseMoneyToCents } from "@/lib/money";
import {
  CLEAN_TYPES, CONDITIONS, FREQUENCIES, MAX_ADDONS, parseRateMills, pricingConfigSchema, type Addon, type PricingConfig,
} from "./config";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (v: string) => (/^\d{1,3}$/.test(v) ? Number(v) : null);
const slug = (name: string, n: number) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "extra"}-${n}`;

/** The Settings → Price calculator form → a valid config, or null when any value is not usable. */
export function parsePricingForm(f: FormData): PricingConfig | null {
  const types: Record<string, { rate_mills: number | null; min_cents: number | null }> = {};
  for (const k of CLEAN_TYPES) types[k] = { rate_mills: parseRateMills(text(f, `rate_${k}`)), min_cents: parseMoneyToCents(text(f, `min_${k}`)) };
  const conditions = Object.fromEntries(CONDITIONS.map((k) => [k, int(text(f, `cond_${k}`))]));
  const frequencies = Object.fromEntries(FREQUENCIES.map((k) => [k, int(text(f, `freq_${k}`))]));

  let rows: unknown;
  try { rows = JSON.parse(text(f, "addons") || "[]"); } catch { return null; }
  if (!Array.isArray(rows) || rows.length > MAX_ADDONS) return null;
  const addons: Addon[] = [];
  const seen = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const row = (r ?? {}) as { id?: unknown; name?: unknown; price?: unknown };
    const name = String(row.name ?? "").trim();
    const price = String(row.price ?? "").trim();
    if (name === "" && price === "") continue; // a blank row the person never filled
    const cents = parseMoneyToCents(price);
    if (name === "" || cents == null) return null;
    let id = /^[a-z0-9_-]{1,40}$/.test(String(row.id ?? "")) ? String(row.id) : slug(name, i + 1);
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    addons.push({ id: id.slice(0, 40), name, price_cents: cents });
  }

  const candidate = {
    types, conditions, frequencies,
    baths: { free_full: int(text(f, "bath_free")), full_cents: parseMoneyToCents(text(f, "bath_full")), half_cents: parseMoneyToCents(text(f, "bath_half")) },
    pets: { one_cents: parseMoneyToCents(text(f, "pet_one")), many_cents: parseMoneyToCents(text(f, "pet_many")) },
    addons,
  };
  const parsed = pricingConfigSchema.safeParse(candidate);
  return parsed.success ? (parsed.data as PricingConfig) : null;
}
