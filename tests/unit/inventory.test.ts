import { describe, expect, it } from "vitest";
import { hoursText, itemSchema, movementSchema, parseQuantity } from "@/modules/inventory/schema";

describe("parseQuantity", () => {
  it("accepts positive numbers with up to 2 decimals", () => {
    expect(parseQuantity("12")).toBe(12);
    expect(parseQuantity("1,250.5")).toBe(1250.5);
    expect(parseQuantity("0.25")).toBe(0.25);
  });
  it("rejects zero, negatives, junk and too many decimals", () => {
    for (const v of ["0", "-3", "abc", "1.234", "", "1e5"]) expect(parseQuantity(v)).toBeNull();
  });
});

describe("itemSchema", () => {
  it("cleans the fields and converts cost to cents", () => {
    const r = itemSchema.parse({ name: "glass cleaner", unit: " Bottle ", min_quantity: "5", unit_cost: "3.50", notes: "" });
    expect(r).toEqual({ name: "Glass Cleaner", unit: "bottle", min_quantity: 5, unit_cost_cents: 350, notes: null });
  });
  it("defaults unit, minimum and cost", () => {
    const r = itemSchema.parse({ name: "Mop" });
    expect([r.unit, r.min_quantity, r.unit_cost_cents]).toEqual(["unit", 0, null]);
  });
  it("rejects an empty name or a bad minimum", () => {
    expect(itemSchema.safeParse({ name: " " }).success).toBe(false);
    expect(itemSchema.safeParse({ name: "Mop", min_quantity: "-1" }).success).toBe(false);
  });
});

describe("movementSchema", () => {
  const base = { quantity: "4", job_id: "", note: "", movement_date: "2026-05-10" };
  it("signs the quantity by type", () => {
    expect(movementSchema.parse({ ...base, kind: "purchase" })).toMatchObject({ kind: "purchase", quantity: 4 });
    expect(movementSchema.parse({ ...base, kind: "use" })).toMatchObject({ kind: "use", quantity: -4 });
    expect(movementSchema.parse({ ...base, kind: "adjust_add" })).toMatchObject({ kind: "adjustment", quantity: 4 });
    expect(movementSchema.parse({ ...base, kind: "adjust_remove" })).toMatchObject({ kind: "adjustment", quantity: -4 });
  });
  it("keeps the job only for uses", () => {
    const job = "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e";
    expect(movementSchema.parse({ ...base, kind: "use", job_id: job }).job_id).toBe(job);
    expect(movementSchema.parse({ ...base, kind: "purchase", job_id: job }).job_id).toBeNull();
  });
  it("rejects bad quantity or type", () => {
    expect(movementSchema.safeParse({ ...base, kind: "use", quantity: "0" }).success).toBe(false);
    expect(movementSchema.safeParse({ ...base, kind: "steal" }).success).toBe(false);
  });
});

describe("hoursText", () => {
  it("formats seconds as hours and minutes", () => {
    expect(hoursText(12600)).toBe("3h 30m");
    expect(hoursText(0)).toBe("0h 00m");
  });
});
