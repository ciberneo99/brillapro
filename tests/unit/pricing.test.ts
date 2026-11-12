import { describe, expect, it } from "vitest";
import { AUSTIN_DEFAULTS, calculate, calcInputSchema, millsToText, parseRateMills, readPricingConfig, type CalcInput } from "@/modules/pricing/config";
import { parsePricingForm } from "@/modules/pricing/form";

const base: CalcInput = { sqft: 2000, bedrooms: 3, fullBaths: 2, halfBaths: 0, pets: "none", type: "standard", condition: "well", frequency: "one_time", addonIds: [] };

describe("price calculator", () => {
  it("prices a standard clean by square foot", () => {
    const b = calculate(AUSTIN_DEFAULTS, base);
    expect(b.total_cents).toBe(22000); // 2,000 sq ft × $0.11
    expect(b.minimum_applied).toBe(false);
  });

  it("charges the minimum for a small home", () => {
    const b = calculate(AUSTIN_DEFAULTS, { ...base, sqft: 600 });
    expect(b.cleaning_cents).toBe(12000);
    expect(b.minimum_applied).toBe(true);
  });

  it("adds extra bathrooms, condition and pets, then takes the frequency discount off the cleaning only", () => {
    const b = calculate(AUSTIN_DEFAULTS, { ...base, fullBaths: 3, halfBaths: 1, condition: "average", pets: "one", frequency: "weekly", addonIds: ["windows", "nope"] });
    expect(b.baths_cents).toBe(1500 + 800);
    const base2 = 22000 + 2300; // 24,300
    expect(b.condition_cents).toBe(Math.round(base2 * 0.15));
    expect(b.pets_cents).toBe(1500);
    const recurring = base2 + b.condition_cents + 1500;
    expect(b.discount_cents).toBe(Math.round(recurring * 0.15));
    expect(b.addons.map((a) => a.id)).toEqual(["windows"]); // unknown ids are ignored
    expect(b.total_cents).toBe(recurring - b.discount_cents + 6000); // the add-on keeps its full price
  });

  it("falls back to the Austin defaults when stored data is missing or broken", () => {
    expect(readPricingConfig(null)).toBe(AUSTIN_DEFAULTS);
    expect(readPricingConfig({ types: "x" })).toBe(AUSTIN_DEFAULTS);
    expect(readPricingConfig(AUSTIN_DEFAULTS)).toEqual(AUSTIN_DEFAULTS);
  });

  it("reads and writes per-square-foot rates without float drift", () => {
    expect(parseRateMills("0.11")).toBe(110);
    expect(parseRateMills("$0.115")).toBe(115);
    expect(parseRateMills("0.1155")).toBeNull();
    expect(parseRateMills("abc")).toBeNull();
    expect(millsToText(110)).toBe("0.11");
    expect(millsToText(115)).toBe("0.115");
  });

  it("rejects nonsense from the browser", () => {
    expect(calcInputSchema.safeParse(base).success).toBe(true);
    expect(calcInputSchema.safeParse({ ...base, sqft: 10 }).success).toBe(false);
    expect(calcInputSchema.safeParse({ ...base, type: "luxury" }).success).toBe(false);
  });
});

describe("pricing settings form", () => {
  function form(over: Record<string, string> = {}) {
    const c = AUSTIN_DEFAULTS;
    const f = new FormData();
    for (const [k, v] of Object.entries(c.types)) { f.set(`rate_${k}`, millsToText(v.rate_mills)); f.set(`min_${k}`, (v.min_cents / 100).toFixed(2)); }
    for (const [k, v] of Object.entries(c.conditions)) f.set(`cond_${k}`, String(v));
    for (const [k, v] of Object.entries(c.frequencies)) f.set(`freq_${k}`, String(v));
    f.set("bath_free", "2"); f.set("bath_full", "15.00"); f.set("bath_half", "8.00"); f.set("pet_one", "15.00"); f.set("pet_many", "30.00");
    f.set("addons", JSON.stringify(c.addons.map((a) => ({ id: a.id, name: a.name, price: (a.price_cents / 100).toFixed(2) }))));
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  }

  it("round-trips the defaults", () => {
    expect(parsePricingForm(form())).toEqual(AUSTIN_DEFAULTS);
  });

  it("adds a new add-on with a generated id and ignores blank rows", () => {
    const rows = [...AUSTIN_DEFAULTS.addons.map((a) => ({ id: a.id, name: a.name, price: (a.price_cents / 100).toFixed(2) })), { id: "", name: "Garage", price: "$55" }, { id: "", name: "", price: "" }];
    const parsed = parsePricingForm(form({ addons: JSON.stringify(rows) }));
    expect(parsed?.addons.at(-1)).toMatchObject({ name: "Garage", price_cents: 5500 });
    expect(parsed?.addons).toHaveLength(AUSTIN_DEFAULTS.addons.length + 1);
  });

  it("rejects bad numbers", () => {
    expect(parsePricingForm(form({ rate_standard: "abc" }))).toBeNull();
    expect(parsePricingForm(form({ freq_weekly: "150" }))).toBeNull();
    expect(parsePricingForm(form({ addons: JSON.stringify([{ id: "", name: "", price: "5" }]) }))).toBeNull();
  });
});
