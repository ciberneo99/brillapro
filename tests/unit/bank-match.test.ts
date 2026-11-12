import { describe, expect, it } from "vitest";
import { autoPairs, candidatesFor } from "@/modules/bank/match";

const tx = (id: string, date: string, cents: number) => ({ id, tx_date: date, amount_cents: cents });
const ex = (id: string, date: string, cents: number) => ({ id, expense_date: date, amount_cents: cents });

describe("candidatesFor", () => {
  it("needs the same amount and a close date, closest first", () => {
    const list = candidatesFor(tx("t", "2026-03-10", -4599), [ex("far", "2026-03-20", 4599), ex("b", "2026-03-08", 4599), ex("a", "2026-03-10", 4599), ex("other", "2026-03-10", 4500)]);
    expect(list.map((e) => e.id)).toEqual(["a", "b"]);
  });
  it("ignores deposits", () => {
    expect(candidatesFor(tx("t", "2026-03-10", 4599), [ex("a", "2026-03-10", 4599)])).toEqual([]);
  });
});

describe("autoPairs", () => {
  it("links only unambiguous pairs", () => {
    const txs = [tx("t1", "2026-03-10", -1000), tx("t2", "2026-03-11", -2000), tx("t3", "2026-03-12", -2000)];
    const expenses = [ex("e1", "2026-03-10", 1000), ex("e2", "2026-03-11", 2000)];
    expect(autoPairs(txs, expenses)).toEqual([{ txId: "t1", expenseId: "e1" }]);
  });
});
