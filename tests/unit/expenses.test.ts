import { describe, expect, it } from "vitest";
import { categorySchema, checkReceipt, expenseSchema } from "@/modules/expenses/schema";

const base = { category_id: "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e", expense_date: "2026-05-10", amount: "1,250.50", vendor: "home depot", description: "", payment_method: "", job_id: "" };

describe("expenseSchema", () => {
  it("converts money to cents and cleans optional fields", () => {
    const r = expenseSchema.parse(base);
    expect(r.amount_cents).toBe(125050);
    expect(r.vendor).toBe("Home Depot");
    expect(r.description).toBeNull();
    expect(r.payment_method).toBeNull();
    expect(r.job_id).toBeNull();
  });
  it("rejects zero, bad amounts, bad dates and malformed methods", () => {
    expect(expenseSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, amount: "abc" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, expense_date: "05/10/2026" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, payment_method: "Bit coin!" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, category_id: "nope" }).success).toBe(false);
  });
});

describe("checkReceipt", () => {
  it("accepts images and PDF up to 5 MB", () => {
    expect(checkReceipt({ type: "application/pdf", size: 1000 })).toEqual({ ext: "pdf" });
    expect(checkReceipt({ type: "image/jpeg", size: 5 * 1024 * 1024 })).toEqual({ ext: "jpg" });
  });
  it("rejects other types and big files", () => {
    expect(checkReceipt({ type: "text/html", size: 10 })).toEqual({ error: "type" });
    expect(checkReceipt({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toEqual({ error: "size" });
  });
});

describe("categorySchema", () => {
  it("requires a name", () => {
    expect(categorySchema.safeParse({ name: "  " }).success).toBe(false);
    expect(categorySchema.parse({ name: "parking fees" }).name).toBe("Parking Fees");
  });
});
