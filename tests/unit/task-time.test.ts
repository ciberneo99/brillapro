import { describe, expect, it } from "vitest";
import { dueInstant, elapsedShare, timeLeft, urgency } from "@/lib/task-time";

const H = 3_600_000;
const D = 24 * H;

describe("dueInstant", () => {
  it("is the end of the due day in the company's zone", () => {
    // New York is UTC-5 in November: 24:00 on the 20th is 05:00 UTC on the 21st.
    expect(new Date(dueInstant("2026-11-20", "America/New_York")).toISOString()).toBe("2026-11-21T05:00:00.000Z");
    // ...and UTC-4 in summer.
    expect(new Date(dueInstant("2026-07-04", "America/New_York")).toISOString()).toBe("2026-07-05T04:00:00.000Z");
  });
  it("handles zones ahead of UTC and daylight-saving days", () => {
    expect(new Date(dueInstant("2026-11-20", "Europe/Madrid")).toISOString()).toBe("2026-11-20T23:00:00.000Z");
    expect(new Date(dueInstant("2026-03-08", "America/New_York")).toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});

describe("timeLeft", () => {
  const due = 1_000 * D;
  it("shows days, then hours, then minutes", () => {
    expect(timeLeft(due - 5 * D - 3 * H, due)).toEqual({ kind: "days", count: 5 });
    expect(timeLeft(due - 23 * H - 10 * 60_000, due)).toEqual({ kind: "hours", count: 23 });
    expect(timeLeft(due - 40 * 60_000, due)).toEqual({ kind: "minutes", count: 40 });
  });
  it("counts how long a task is overdue", () => {
    expect(timeLeft(due + 2 * D + H, due)).toEqual({ kind: "overdueDays", count: 2 });
    expect(timeLeft(due + 3 * H, due)).toEqual({ kind: "overdueHours", count: 3 });
    expect(timeLeft(due + 5 * 60_000, due)).toEqual({ kind: "overdueMinutes", count: 5 });
  });
});

describe("elapsedShare and urgency", () => {
  it("fills the bar between creation and deadline", () => {
    expect(elapsedShare(50, 0, 100)).toBe(0.5);
    expect(elapsedShare(-5, 0, 100)).toBe(0);
    expect(elapsedShare(500, 0, 100)).toBe(1);
    expect(elapsedShare(10, 100, 100)).toBe(1);
  });
  it("turns amber in the last 3 days and red in the last day", () => {
    expect(urgency(0, 10 * D)).toBe("ok");
    expect(urgency(0, 2 * D)).toBe("soon");
    expect(urgency(0, 20 * H)).toBe("urgent");
    expect(urgency(10, 0)).toBe("urgent");
  });
});
