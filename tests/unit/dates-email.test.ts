import { describe, expect, it } from "vitest";
import { formatDateOnly, formatLocalDate, formatTimestamp } from "@/lib/dates";
import { isValidEmail, sanitizeEmail } from "@/lib/email";

describe("dates", () => {
  it("shows MM/DD/YYYY by default", () => {
    expect(formatDateOnly("2026-05-01")).toBe("05/01/2026");
    expect(formatLocalDate(new Date(2026, 11, 31))).toBe("12/31/2026");
  });
  it("honors the company's chosen format", () => {
    expect(formatDateOnly("2026-05-01", "DD/MM/YYYY")).toBe("01/05/2026");
    expect(formatDateOnly("2026-05-01", "YYYY-MM-DD")).toBe("2026-05-01");
    expect(formatDateOnly("2026-05-01", "nonsense")).toBe("05/01/2026");
  });
  it("date-only values are never shifted by time zones", () => {
    expect(formatDateOnly("2026-01-01")).toBe("01/01/2026");
    expect(formatDateOnly("")).toBe("");
    expect(formatDateOnly(null)).toBe("");
  });
  it("timestamps use the company time zone", () => {
    // 03:30 UTC on May 2nd is still May 1st in New York and Los Angeles, already May 2nd in UTC
    expect(formatTimestamp("2026-05-02T03:30:00Z", "MM/DD/YYYY", "America/New_York")).toBe("05/01/2026");
    expect(formatTimestamp("2026-05-02T03:30:00Z", "MM/DD/YYYY", "UTC")).toBe("05/02/2026");
    expect(formatTimestamp("garbage")).toBe("");
    expect(formatTimestamp("2026-05-02T03:30:00Z", "MM/DD/YYYY", "Not/AZone")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe("email", () => {
  it("cleans input while typing", () => {
    expect(sanitizeEmail("Ana Lopez@Example.COM")).toBe("analopez@example.com");
    expect(sanitizeEmail("a@@b.com")).toBe("a@b.com");
    expect(sanitizeEmail("a@b@c.com")).toBe("a@bc.com");
    expect(sanitizeEmail("ñandú<script>@x.com")).toBe("andscript@x.com");
    expect(sanitizeEmail("first.last+tag@mail.example.com")).toBe("first.last+tag@mail.example.com");
  });
  it("accepts only complete, well-formed addresses", () => {
    for (const ok of ["a@b.co", "first.last+tag@mail.example.com", "x_y-z@sub-domain.org"]) expect(isValidEmail(ok)).toBe(true);
    for (const bad of ["", "a", "a@", "a@b", "a@b.", "@b.com", "a@b.c", "a b@c.com", "a@@b.com", "a..b@c.com", ".a@b.com", "a.@b.com", "a@b..com"])
      expect(isValidEmail(bad)).toBe(false);
  });
});
