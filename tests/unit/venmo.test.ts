import { describe, expect, it } from "vitest";
import { buildVenmoReport, parseCsv, parseVenmoAmount } from "@/modules/venmo/parse";

const HEAD = ",ID,Datetime,Type,Status,Note,From,To,Amount (total),Amount (tip),Amount (tax),Amount (fee),Tax Rate,Tax Exempt,Funding Source,Destination,Beginning Balance,Ending Balance,Statement Period Venmo Fees,Terminal Location,Year to Date Venmo Fees,Disclaimer";
const CSV = [
  "Account Statement - (@Test-Owner) ,,,,,,,,,,,,,,,,,,,,,",
  "Account Activity,,,,,,,,,,,,,,,,,,,,,",
  HEAD,
  ',,,,,,,,,,,,,,,,"$1,062.00",,,,,',
  ",1,2026-03-06T23:50:45,Payment,Complete,cleaning,ann lee,Test Owner,+ $135.00,,0,,0,,,Venmo balance,,,,Venmo,,",
  ",2,2026-03-07T01:00:00,Charge,Complete,Basic clean,Test Owner,Bob Ray,+ $60.00,,0,,0,,,Venmo balance,,,,Venmo,,",
  ",3,2026-03-20T13:00:00,Payment,Complete,again,Ann Lee,Test Owner,+ $135.00,,0,,0,,,Venmo balance,,,,Venmo,,",
  ",4,2026-03-14T13:58:10,Standard Transfer,Issued,,,,\"- $1,000.00\",,,,,,,Wells Fargo *0122,,,,Venmo,,",
  ",5,2026-03-21T10:00:00,Payment,Pending,nope,Zed,Test Owner,+ $999.00,,0,,0,,,Venmo balance,,,,Venmo,,",
  ',,,,,,,,,,,,,,,,,$62.00,$0.00,,$0.00,"In case of errors',
  '        call us. ""Quoted"" text, with commas"',
].join("\n");

describe("parseVenmoAmount", () => {
  it("reads signed dollar text", () => {
    expect(parseVenmoAmount("+ $135.00")).toBe(13500);
    expect(parseVenmoAmount("- $1,000.00")).toBe(-100000);
    expect(parseVenmoAmount("$62.00")).toBe(6200);
    expect(parseVenmoAmount("-$5")).toBe(-500);
  });
  it("rejects junk", () => {
    for (const v of ["", "abc", "$", "1.234.5"]) expect(parseVenmoAmount(v)).toBeNull();
  });
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and line breaks inside quotes", () => {
    expect(parseCsv('a,"b ""x"" , c",d\n1,"two\nlines",3')).toEqual([["a", 'b "x" , c', "d"], ["1", "two\nlines", "3"]]);
  });
});

describe("buildVenmoReport", () => {
  const r = (() => { const x = buildVenmoReport(CSV, "America/New_York"); if (!x.ok) throw new Error(x.error); return x.report; })();

  it("totals received, transfers and excludes unfinished payments", () => {
    expect(r.received).toEqual({ cents: 33000, count: 3 });
    expect(r.transfers).toEqual({ cents: 100000, count: 1 });
    expect(r.sent.count).toBe(0);
    expect(r.excluded).toBe(1);
  });
  it("reads account and balances, and checks the statement adds up", () => {
    expect(r.account).toBe("@Test-Owner");
    expect([r.beginning_cents, r.ending_cents]).toEqual([106200, 6200]);
    // 1062 + 330 - 1000 = 392, not 62: the sample deliberately does not add up
    expect(r.difference_cents).toBe(33000);
  });
  it("detects the owner and groups clients case-insensitively", () => {
    expect(r.byClient.map((g) => [g.name, g.count, g.cents])).toEqual([["Ann Lee", 2, 27000], ["Bob Ray", 1, 6000]]);
    expect(r.transactions.find((t) => t.id === "4")?.counterparty).toBe("Wells Fargo *0122");
  });
  it("uses the company time zone for dates and groups by Sunday weeks", () => {
    // 2026-03-07T01:00Z is still March 6 in New York
    expect(r.transactions.find((t) => t.id === "2")?.date).toBe("2026-03-06");
    expect(r.byWeek.map((g) => [g.name, g.cents])).toEqual([["2026-03-01", 33000 - 13500], ["2026-03-15", 13500]]);
  });
  it("fails clearly on files that are not a Venmo statement", () => {
    expect(buildVenmoReport("")).toEqual({ ok: false, error: "empty" });
    expect(buildVenmoReport("a,b\n1,2")).toEqual({ ok: false, error: "format" });
  });
});
