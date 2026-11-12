import { z } from "zod";

/** The four kinds of cleaning, the home conditions, the frequencies and the pet options the calculator knows. */
export const CLEAN_TYPES = ["standard", "deep", "move", "airbnb"] as const;
export const CONDITIONS = ["well", "average", "dirty", "extreme"] as const;
export const FREQUENCIES = ["one_time", "weekly", "biweekly", "monthly"] as const;
export const PET_OPTIONS = ["none", "one", "many"] as const;
export const CALC_PROPERTY_TYPES = ["house", "apartment", "condo", "townhouse"] as const;

export type CleanType = (typeof CLEAN_TYPES)[number];
export type Condition = (typeof CONDITIONS)[number];
export type Frequency = (typeof FREQUENCIES)[number];
export type PetOption = (typeof PET_OPTIONS)[number];

export const MAX_ADDONS = 20;

export type Addon = { id: string; name: string; price_cents: number };

/** Money is integer cents. The per-square-foot rate is in "mills" (thousandths of a dollar): 110 = $0.110 per sq ft. */
export type PricingConfig = {
  types: Record<CleanType, { rate_mills: number; min_cents: number }>;
  conditions: Record<Condition, number>; // % added on top of the cleaning
  frequencies: Record<Frequency, number>; // % taken off the cleaning
  baths: { free_full: number; full_cents: number; half_cents: number };
  pets: { one_cents: number; many_cents: number };
  addons: Addon[];
};

/** Starting rates for Austin, TX and the surrounding area (Round Rock, Cedar Park, Pflugerville, Georgetown, Kyle, Buda...). Every one is editable in Settings. */
export const AUSTIN_DEFAULTS: PricingConfig = {
  types: {
    standard: { rate_mills: 110, min_cents: 12000 },
    deep: { rate_mills: 180, min_cents: 20000 },
    move: { rate_mills: 220, min_cents: 22000 },
    airbnb: { rate_mills: 150, min_cents: 9000 },
  },
  conditions: { well: 0, average: 15, dirty: 30, extreme: 60 },
  frequencies: { one_time: 0, weekly: 15, biweekly: 10, monthly: 5 },
  baths: { free_full: 2, full_cents: 1500, half_cents: 800 },
  pets: { one_cents: 1500, many_cents: 3000 },
  addons: [
    { id: "windows", name: "Window cleaning", price_cents: 6000 },
    { id: "appliances", name: "Inside appliances", price_cents: 4500 },
    { id: "carpet", name: "Carpet cleaning", price_cents: 7500 },
    { id: "walls", name: "Walls & baseboards", price_cents: 5000 },
    { id: "laundry", name: "Laundry", price_cents: 3000 },
    { id: "fridge", name: "Inside fridge", price_cents: 3500 },
    { id: "cabinets", name: "Inside cabinets", price_cents: 4000 },
    { id: "blinds", name: "Blinds", price_cents: 3500 },
  ],
};

const cents = z.number().int().min(0).max(10_000_000);
const record = <K extends readonly [string, ...string[]], V extends z.ZodType>(keys: K, value: V) =>
  z.object(Object.fromEntries(keys.map((k) => [k, value])) as Record<K[number], V>);

export const pricingConfigSchema = z.object({
  types: record(CLEAN_TYPES, z.object({ rate_mills: z.number().int().min(0).max(5000), min_cents: cents })),
  conditions: record(CONDITIONS, z.number().int().min(0).max(300)),
  frequencies: record(FREQUENCIES, z.number().int().min(0).max(100)),
  baths: z.object({ free_full: z.number().int().min(0).max(20), full_cents: cents, half_cents: cents }),
  pets: z.object({ one_cents: cents, many_cents: cents }),
  addons: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    name: z.string().trim().min(1).max(60),
    price_cents: cents,
  })).max(MAX_ADDONS),
});

/** Stored JSON → a complete, valid config. Anything missing or broken falls back to the Austin defaults. */
export function readPricingConfig(stored: unknown): PricingConfig {
  const parsed = pricingConfigSchema.safeParse(stored);
  return parsed.success ? (parsed.data as PricingConfig) : AUSTIN_DEFAULTS;
}

export type CalcInput = {
  sqft: number;
  bedrooms: number;
  fullBaths: number;
  halfBaths: number;
  pets: PetOption;
  type: CleanType;
  condition: Condition;
  frequency: Frequency;
  addonIds: string[];
};

export type Breakdown = {
  rate_cents: number; // sq ft × rate, before the minimum
  cleaning_cents: number; // the larger of that and the type's minimum
  minimum_applied: boolean;
  baths_cents: number;
  condition_cents: number;
  pets_cents: number;
  addons: Addon[];
  addons_cents: number;
  discount_cents: number;
  total_cents: number;
};

/** The whole price, in integer cents. The browser uses it for the live preview and the server runs it again before saving anything. */
export function calculate(cfg: PricingConfig, input: CalcInput): Breakdown {
  const type = cfg.types[input.type];
  const rate_cents = Math.round((input.sqft * type.rate_mills) / 10);
  const cleaning_cents = Math.max(type.min_cents, rate_cents);
  const baths_cents = Math.max(0, input.fullBaths - cfg.baths.free_full) * cfg.baths.full_cents + input.halfBaths * cfg.baths.half_cents;
  const base = cleaning_cents + baths_cents;
  const condition_cents = Math.round((base * cfg.conditions[input.condition]) / 100);
  const pets_cents = input.pets === "one" ? cfg.pets.one_cents : input.pets === "many" ? cfg.pets.many_cents : 0;
  // The frequency discount is for the recurring cleaning. Add-ons are extras and keep their full price.
  const recurring = base + condition_cents + pets_cents;
  const discount_cents = Math.round((recurring * cfg.frequencies[input.frequency]) / 100);
  const addons = cfg.addons.filter((a) => input.addonIds.includes(a.id));
  const addons_cents = addons.reduce((sum, a) => sum + a.price_cents, 0);
  return {
    rate_cents, cleaning_cents, minimum_applied: cleaning_cents > rate_cents, baths_cents, condition_cents, pets_cents,
    addons, addons_cents, discount_cents, total_cents: recurring - discount_cents + addons_cents,
  };
}

/** Rate text → mills. "0.11" → 110, "0.115" → 115. Null when it is not a rate. */
export function parseRateMills(text: string): number | null {
  const t = text.replace(/[$\s]/g, "");
  if (!/^\d{1,2}(\.\d{1,3})?$/.test(t)) return null;
  const mills = Math.round(Number(t) * 1000);
  return mills <= 5000 ? mills : null;
}
export const millsToText = (mills: number): string => (mills / 1000).toFixed(3).replace(/0$/, "");

/** Input from the browser, checked and clamped to sensible limits. Null when it makes no sense. */
export const calcInputSchema = z.object({
  sqft: z.number().int().min(200).max(50_000),
  bedrooms: z.number().int().min(0).max(20),
  fullBaths: z.number().int().min(0).max(20),
  halfBaths: z.number().int().min(0).max(20),
  pets: z.enum(PET_OPTIONS),
  type: z.enum(CLEAN_TYPES),
  condition: z.enum(CONDITIONS),
  frequency: z.enum(FREQUENCIES),
  addonIds: z.array(z.string().max(40)).max(MAX_ADDONS),
});
