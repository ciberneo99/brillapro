import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "@/lib/phone";

describe("formatPhone (live typing)", () => {
  it("formats progressively as xxx-xxx-xxxx", () => {
    expect(formatPhone("5")).toBe("5");
    expect(formatPhone("555")).toBe("555");
    expect(formatPhone("5551")).toBe("555-1");
    expect(formatPhone("555123")).toBe("555-123");
    expect(formatPhone("5551234")).toBe("555-123-4");
    expect(formatPhone("5551234567")).toBe("555-123-4567");
  });
  it("handles pasted formats and ignores extra digits", () => {
    expect(formatPhone("(555) 123-4567")).toBe("555-123-4567");
    expect(formatPhone("+1 555 123 4567")).toBe("555-123-4567");
    expect(formatPhone("15551234567")).toBe("555-123-4567");
    expect(formatPhone("555123456789")).toBe("555-123-4567");
  });
  it("lets backspace work and drops letters", () => {
    expect(formatPhone("555-")).toBe("555");
    expect(formatPhone("abc555x123")).toBe("555-123");
    expect(formatPhone("")).toBe("");
  });
  it("leaves international numbers untouched", () => {
    expect(formatPhone("+52 81 1234 5678")).toBe("+52 81 1234 5678");
  });
});

describe("normalizePhone (server)", () => {
  it("formats complete US numbers", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("555-123-4567");
    expect(normalizePhone("1-555-123-4567")).toBe("555-123-4567");
    expect(normalizePhone(" 555.123.4567 ")).toBe("555-123-4567");
  });
  it("keeps anything that is not a complete US number as typed", () => {
    expect(normalizePhone("555-1234")).toBe("555-1234");
    expect(normalizePhone("+52 81 1234 5678")).toBe("+52 81 1234 5678");
    expect(normalizePhone("")).toBe("");
  });
});
