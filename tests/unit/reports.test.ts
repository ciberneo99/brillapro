import { describe, expect, it } from "vitest";
import { toCsv } from "@/modules/reports/csv";
import { sortByDate } from "@/modules/reports/format";
import { parsePeriod, periodQuery } from "@/modules/reports/period";

describe("report CSV", () => {
  const r = {
    cols: [{ key: "name", label: "Customer", kind: "text" as const }, { key: "amount", label: "Amount", kind: "money" as const }, { key: "date", label: "Date", kind: "date" as const }],
    rows: [{ name: 'Smith, "Jo"', amount: 12345, date: "2026-01-05" }, { name: "=HYPERLINK(1)", amount: 5, date: "2026-01-06" }],
    totals: { name: "Total", amount: 12350 },
    stats: [],
    tableTitle: "",
  };
  it("writes money as decimals, quotes commas and quotes, and ends with the totals", () => {
    const lines = toCsv(r).replace("\uFEFF", "").trim().split("\r\n");
    expect(lines[0]).toBe("Customer,Amount,Date");
    expect(lines[1]).toBe('"Smith, ""Jo""",123.45,2026-01-05');
    expect(lines[3]).toBe("Total,123.50,");
  });
  it("neutralises cells a spreadsheet would run as formulas", () => {
    expect(toCsv(r)).toContain("'=HYPERLINK(1)");
  });
  it("starts with a byte-order mark so Excel reads accents", () => {
    expect(toCsv(r).charCodeAt(0)).toBe(0xfeff);
  });
});

describe("report period", () => {
  const today = "2026-11-10";
  it("defaults to the current month", () => {
    expect(parsePeriod({}, today)).toMatchObject({ mode: "month", from: "2026-11-01", to: "2026-11-30" });
  });
  it("reads a month, a year and a custom range", () => {
    expect(parsePeriod({ month: "2026-02" }, today)).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    expect(parsePeriod({ year: "2025" }, today)).toMatchObject({ mode: "year", from: "2025-01-01", to: "2025-12-31" });
    expect(parsePeriod({ from: "2026-01-15", to: "2026-03-20" }, today)).toMatchObject({ mode: "custom", from: "2026-01-15", to: "2026-03-20" });
  });
  it("ignores bad input and backwards ranges", () => {
    expect(parsePeriod({ month: "2026-13" }, today).mode).toBe("month");
    expect(parsePeriod({ from: "2026-03-20", to: "2026-01-15" }, today).mode).toBe("month");
    expect(parsePeriod({ from: "nope", to: "2026-01-15" }, today).from).toBe("2026-11-01");
  });
  it("round-trips through the query string", () => {
    expect(periodQuery(parsePeriod({ year: "2025" }, today))).toBe("year=2025");
    expect(periodQuery(parsePeriod({ from: "2026-01-15", to: "2026-03-20" }, today))).toBe("from=2026-01-15&to=2026-03-20");
  });
});

describe("report presets and sorting", () => {
  const today = "2026-11-10";
  it("reads the period presets", () => {
    expect(parsePeriod({ range: "all" }, today)).toMatchObject({ mode: "all", range: "all", from: "2000-01-01" });
    expect(parsePeriod({ range: "last_month" }, today)).toMatchObject({ range: "last_month", from: "2026-10-01", to: "2026-10-31" });
    expect(parsePeriod({ range: "this_year" }, today)).toMatchObject({ range: "this_year", from: "2026-01-01", to: "2026-12-31" });
    expect(parsePeriod({ range: "last_year" }, today)).toMatchObject({ range: "last_year", from: "2025-01-01", to: "2025-12-31" });
  });
  it("uses the fallback when nothing valid is given", () => {
    expect(parsePeriod({}, today, "all").mode).toBe("all");
    expect(parsePeriod({ range: "bogus" }, today, "all").mode).toBe("all");
    expect(periodQuery(parsePeriod({ range: "last_year" }, today))).toBe("range=last_year");
  });
  it("sorts rows and groups by the date column", () => {
    const rows = [{ date: "2026-01-02" }, { date: "2026-03-01" }, { date: "2026-02-01" }];
    const r = { cols: [{ key: "date", label: "Date", kind: "date" as const }], rows, stats: [], tableTitle: "", groups: [{ label: "A", count: 3, totalCents: 0, rows }] };
    expect(sortByDate(r, "desc").rows.map((x) => x.date)).toEqual(["2026-03-01", "2026-02-01", "2026-01-02"]);
    expect(sortByDate(r, "asc").groups![0].rows.map((x) => x.date)).toEqual(["2026-01-02", "2026-02-01", "2026-03-01"]);
    expect(sortByDate(r, "none").rows).toEqual(rows);
  });
});
