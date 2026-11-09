import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";
import { formatTime, parseTime } from "@/lib/time";
import { jobSchema } from "@/modules/jobs/schema";

describe("time", () => {
  it("formats US 12-hour and parses form values", () => {
    expect(formatTime("14:30:00")).toBe("2:30 PM");
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime(null)).toBe("");
    expect(parseTime("9:05")).toBe("09:05");
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("")).toBeNull();
  });
});

describe("job schema", () => {
  const base = { title: "deep clean", scheduled_date: "2026-06-01" };
  it("normalizes and converts price to cents", () => {
    const r = jobSchema.parse({ ...base, price: "1,250.50", address: "1 main st austin", start_time: "09:00", end_time: "11:30" });
    expect(r).toMatchObject({ title: "Deep Clean", price_cents: 125050, start_time: "09:00", end_time: "11:30" });
    expect(r.address).toBe("1 Main St Austin");
    expect(r.service_type_id).toBeNull();
  });
  it("rejects end before start, bad dates and bad money", () => {
    expect(jobSchema.safeParse({ ...base, start_time: "10:00", end_time: "09:00" }).success).toBe(false);
    expect(jobSchema.safeParse({ ...base, scheduled_date: "06/01/2026" }).success).toBe(false);
    expect(jobSchema.safeParse({ ...base, price: "abc" }).success).toBe(false);
    expect(jobSchema.safeParse({ title: " ", scheduled_date: "2026-06-01" }).success).toBe(false);
  });
});

describe("employees permissions", () => {
  it("managers manage, office reads, field employees and accountants have none", () => {
    expect(can("manager", "employees:write")).toBe(true);
    expect(can("office_staff", "employees:read")).toBe(true);
    expect(can("office_staff", "employees:write")).toBe(false);
    expect(can("employee", "employees:read")).toBe(false);
    expect(can("accountant", "employees:read")).toBe(false);
  });
});
