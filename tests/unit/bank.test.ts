import { describe, expect, it } from "vitest";
import { dedupeInput, detectYear, parseMoney, parseStatement, suggestCategory } from "@/modules/bank/parse";

describe("bank statement parsing", () => {
  it("reads amounts in the usual bank notations", () => {
    expect(parseMoney("$1,234.56")).toBe(123456);
    expect(parseMoney("-45.00")).toBe(-4500);
    expect(parseMoney("(45.00)")).toBe(-4500);
    expect(parseMoney("45.00-")).toBe(-4500);
    expect(parseMoney("abc")).toBeNull();
  });

  it("finds the statement year in the header", () => {
    expect(detectYear(["Statement period January 1, 2025 through January 31, 2025"], 2030)).toBe(2025);
    expect(detectYear(["nothing here"], 2030)).toBe(2030);
  });

  it("reads dated rows with a running balance and works out deposits from withdrawals", () => {
    const text = [
      "Business Checking",
      "Statement period January 1, 2026 through January 31, 2026",
      "Beginning balance $1,000.00",
      "TRANSACTION DETAIL",
      "01/02 Zelle payment from Rita Lopez 150.00 1,150.00",
      "01/03 SHELL OIL 57444 45.20 1,104.80",
      "01/05 Monthly service fee 12.00 1,092.80",
      "Total deposits and additions $150.00",
      "Daily ending balance",
      "01/02 1,150.00",
    ].join("\n");
    const { transactions: t } = parseStatement(text, 2020);
    expect(t).toHaveLength(3);
    expect(t[0]).toEqual({ date: "2026-01-02", description: "Zelle payment from Rita Lopez", amountCents: 15000, balanceCents: 115000 });
    expect(t[1]).toMatchObject({ date: "2026-01-03", amountCents: -4520, balanceCents: 110480 });
    expect(t[2]).toMatchObject({ amountCents: -1200 });
  });

  it("uses the section headings when there is no balance column", () => {
    const text = ["Deposits and additions", "03/01/2026 Mobile deposit 500.00", "Withdrawals and debits", "03/02/2026 Office supplies 20.00", "03/03/2026 Refund -5.00"].join("\n");
    const { transactions: t } = parseStatement(text);
    expect(t.map((x) => x.amountCents)).toEqual([50000, -2000, -500]);
  });

  it("joins wrapped descriptions, with the amount on the next line", () => {
    const text = ["Jan 9, 2026 CHECK 1042 TO", "Janitorial Depot", "85.00 915.00"].join("\n");
    const { transactions: t } = parseStatement(text);
    expect(t).toHaveLength(1);
    expect(t[0].description).toBe("CHECK 1042 TO Janitorial Depot");
    expect(t[0].amountCents).toBe(-8500);
  });

  it("ignores text that is not a transaction", () => {
    expect(parseStatement("Thank you for banking with us\nPage 1 of 2").transactions).toEqual([]);
    expect(parseStatement("13/45 Something 10.00").transactions).toEqual([]);
  });

  it("suggests a category from keywords and builds stable keys", () => {
    const cats = [{ id: "a", keywords: "zelle" }, { id: "b", keywords: "zelle from,payment" }, { id: "c", keywords: "" }];
    expect(suggestCategory("Zelle payment from X", cats)).toBe("b");
    expect(suggestCategory("Random store", cats)).toBeNull();
    const t = { date: "2026-01-02", description: "A", amountCents: 100, balanceCents: null };
    expect(dedupeInput(t, 0)).not.toBe(dedupeInput(t, 1));
  });
});
