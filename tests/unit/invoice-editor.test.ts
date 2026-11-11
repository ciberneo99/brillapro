import { describe, expect, it } from "vitest";
import { computeTotals, moveItem, textToCents, textToQty } from "@/lib/invoice-math";
import { checkLogo } from "@/lib/logo";

describe("computeTotals", () => {
  it("rounds each line to cents, caps the discount and taxes the rest", () => {
    const t = computeTotals([{ quantity: 1.5, unit_price_cents: 3333 }, { quantity: 2, unit_price_cents: 1000 }], 500, 8.25);
    expect(t.subtotal).toBe(Math.round(1.5 * 3333) + 2000);
    expect(t.discount).toBe(500);
    expect(t.tax).toBe(Math.round(((t.subtotal - 500) * 8.25) / 100));
    expect(t.total).toBe(t.subtotal - 500 + t.tax);
  });
  it("never discounts below zero", () => {
    expect(computeTotals([{ quantity: 1, unit_price_cents: 1000 }], 99999, 0).total).toBe(0);
  });
});

describe("moveItem", () => {
  it("moves an item and keeps the rest in order", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  });
  it("ignores impossible moves and does not mutate", () => {
    const l = ["a", "b"];
    expect(moveItem(l, 0, 5)).toEqual(["a", "b"]);
    expect(moveItem(l, 1, 1)).toEqual(["a", "b"]);
    expect(l).toEqual(["a", "b"]);
  });
});

describe("typed text", () => {
  it("reads quantities and prices, treating junk as zero", () => {
    expect(textToQty("2.5")).toBe(2.5);
    expect(textToQty("abc")).toBe(0);
    expect(textToCents("1,250.50")).toBe(125050);
    expect(textToCents("")).toBe(0);
  });
});

describe("checkLogo", () => {
  it("accepts small PNG/JPG only", () => {
    expect(checkLogo({ type: "image/png", size: 1000 })).toEqual({ ext: "png" });
    expect(checkLogo({ type: "image/jpeg", size: 1000 })).toEqual({ ext: "jpg" });
    expect(checkLogo({ type: "image/svg+xml", size: 1000 })).toEqual({ error: "type" });
    expect(checkLogo({ type: "image/png", size: 2 * 1024 * 1024 })).toEqual({ error: "size" });
  });
});
