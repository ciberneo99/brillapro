import { describe, expect, it } from "vitest";
import { addDays, addMonths, isIsoDate, monthGrid, startOfWeek, todayIso, weekDays } from "@/lib/calendar";

describe("calendar math", () => {
  it("weeks start on Sunday", () => {
    expect(startOfWeek("2026-05-06")).toBe("2026-05-03"); // Wednesday → Sunday
    expect(startOfWeek("2026-05-03")).toBe("2026-05-03");
    expect(weekDays("2026-05-06")).toEqual(["2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08", "2026-05-09"]);
  });
  it("adds days and months without drifting", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
  it("month grid covers the whole month in full Sunday-first weeks", () => {
    const g = monthGrid("2026-05-10");
    expect(g[0][0]).toBe("2026-04-26");
    expect(g.at(-1)!.at(-1)).toBe("2026-06-06");
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g.flat()).toContain("2026-05-31");
  });
  it("validates ISO dates and finds today in a time zone", () => {
    expect(isIsoDate("2026-05-01")).toBe(true);
    expect(isIsoDate("05/01/2026")).toBe(false);
    expect(isIsoDate("2026-13-45")).toBe(false);
    const t = new Date("2026-05-01T03:00:00Z"); // still April 30 in New York
    expect(todayIso("America/New_York", t)).toBe("2026-04-30");
    expect(todayIso("UTC", t)).toBe("2026-05-01");
  });
});
