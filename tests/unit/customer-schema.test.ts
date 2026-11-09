import { describe, expect, it } from "vitest";
import { centsToInput, customerFormSchema, displayName, restoredStatus } from "@/modules/customers/schema";

const base = { first_name: "Ana", last_name: "", company_name: "" };
const parse = (o: Record<string, string>) => customerFormSchema.safeParse({ ...base, ...o });

describe("customer form schema", () => {
  it("requires a name or a company", () => {
    expect(parse({ first_name: "" }).success).toBe(false);
    expect(parse({ first_name: "", company_name: "Acme LLC" }).success).toBe(true);
    expect(parse({ first_name: "   " }).success).toBe(false);
  });

  it("turns empty inputs into null and trims text", () => {
    const r = parse({ first_name: "  Ana ", email: "", phone: " ", city: " Austin " });
    expect(r.success && r.data).toMatchObject({ first_name: "Ana", email: null, phone: null, city: "Austin" });
  });

  it("converts dollars to integer cents without float drift", () => {
    for (const [input, cents] of [["150", 15000], ["149.99", 14999], ["0.1", 10], ["1,250.50", 125050], ["", null]] as const) {
      const r = parse({ estimated_price: input });
      expect(r.success && r.data.estimated_price_cents).toBe(cents);
    }
    expect(parse({ estimated_price: "-5" }).success).toBe(false);
    expect(parse({ estimated_price: "12.345" }).success).toBe(false);
    expect(parse({ estimated_price: "abc" }).success).toBe(false);
  });

  it("accepts half bathrooms only and bounded integers", () => {
    expect(parse({ bathrooms: "2.5" }).success).toBe(true);
    expect(parse({ bathrooms: "2.3" }).success).toBe(false);
    expect(parse({ bedrooms: "3" }).success).toBe(true);
    expect(parse({ bedrooms: "-1" }).success).toBe(false);
    expect(parse({ square_footage: "0" }).success).toBe(false);
    expect(parse({ square_footage: "1800" }).success).toBe(true);
  });

  it("rejects unknown enum values, bad emails and bad dates", () => {
    expect(parse({ property_type: "castle" }).success).toBe(false);
    expect(parse({ cleaning_frequency: "daily" }).success).toBe(false);
    expect(parse({ cleaning_frequency: "biweekly" }).success).toBe(true);
    expect(parse({ email: "not-an-email" }).success).toBe(false);
    expect(parse({ email: "Ana@Example.com" }).success && true).toBe(true);
    expect(parse({ customer_since: "2026-13-45" }).success).toBe(false);
    expect(parse({ customer_since: "2026-05-01" }).success).toBe(true);
  });

  it("lowercases email, enforces max lengths, and drops unknown keys (no mass assignment)", () => {
    const r = parse({ email: "ANA@EXAMPLE.COM", tenant_id: "x", status: "active" });
    expect(r.success && r.data.email).toBe("ana@example.com");
    expect(r.success && "tenant_id" in r.data).toBe(false);
    expect(r.success && "status" in r.data).toBe(false);
    expect(parse({ notes: "x".repeat(5001) }).success).toBe(false);
  });

  it("helpers", () => {
    expect(centsToInput(15000)).toBe("150.00");
    expect(centsToInput(null)).toBe("");
    expect(displayName({ first_name: "Ana", last_name: "Lopez", company_name: "Acme" })).toBe("Ana Lopez");
    expect(displayName({ first_name: "", last_name: "", company_name: "Acme" })).toBe("Acme");
    expect(restoredStatus({ converted_at: null })).toBe("prospect");
    expect(restoredStatus({ converted_at: "2026-01-01" })).toBe("active");
  });
});
