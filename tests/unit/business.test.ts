import { describe, expect, it } from "vitest";
import { cityLine, displayUrl, fullAddress, normalizeWebsite } from "@/lib/business";

describe("business profile helpers", () => {
  it("builds the city line and the full address", () => {
    expect(cityLine({ city: "Austin", state: "TX", zip_code: "78745" })).toBe("Austin, TX 78745");
    expect(cityLine({ city: null, state: "TX", zip_code: null })).toBe("TX");
    expect(fullAddress({ address: "4821 Cedar Ave", city: "Austin", state: "TX", zip_code: "78745" })).toBe("4821 Cedar Ave\nAustin, TX 78745");
    expect(fullAddress({ address: null, city: null, state: null, zip_code: null })).toBeNull();
  });
  it("normalizes websites", () => {
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite("www.sparkle.com/")).toBe("https://www.sparkle.com");
    expect(normalizeWebsite("http://a.co/x")).toBe("http://a.co/x");
    expect(normalizeWebsite("nodots")).toBe("invalid");
    expect(displayUrl("https://www.sparkle.com")).toBe("www.sparkle.com");
  });
});
