import { describe, expect, it } from "vitest";
import { merchantKey, pickLearned } from "@/modules/bank/learn";

describe("merchantKey", () => {
  it("finds the merchant word in typical bank lines", () => {
    expect(merchantKey("POS DEBIT 03/12 WHATABURGER #1234 AUSTIN TX")).toBe("whataburger");
    expect(merchantKey("PURCHASE AUTHORIZED ON 03/14 HOME DEPOT #6502 AUSTIN TX")).toBe("home depot");
    expect(merchantKey("CHECKCARD 0312 SHELL OIL 57444 AUSTIN TX")).toBe("shell oil");
    expect(merchantKey("AMZN Mktp US*2K4TT1 Amzn.com/bill WA")).toBe("amzn mktp");
  });
  it("is stable across dates and reference numbers", () => {
    expect(merchantKey("WALMART #0023 04/02 AUSTIN")).toBe(merchantKey("WALMART SUPERCENTER #5521 05/09 ROUND ROCK"));
  });
  it("gives nothing for lines with no merchant", () => {
    expect(merchantKey("ACH 12345 6789")).toBeNull();
  });
});

describe("pickLearned", () => {
  it("follows the most chosen category and treats a tie as unknown", () => {
    expect(pickLearned([{ category_id: "a", hits: 1 }])).toBe("a");
    expect(pickLearned([{ category_id: "a", hits: 1 }, { category_id: "b", hits: 3 }])).toBe("b");
    expect(pickLearned([{ category_id: "a", hits: 2 }, { category_id: "b", hits: 2 }])).toBeNull();
    expect(pickLearned([])).toBeNull();
  });
});
