import { describe, expect, it } from "vitest";
import { hasSuggestion, interpretReading } from "@/modules/expenses/receipt-reading";

const cats = [{ id: "c1", name: "Cleaning supplies" }, { id: "c2", name: "Fuel and travel" }];
const today = "2026-11-09";
const raw = { vendor: "the home depot", date: "2026-11-02", total: "$1,245.50", category: "cleaning supplies" };

describe("interpretReading", () => {
  it("cleans a good reading into form values", () => {
    expect(interpretReading(raw, cats, today)).toEqual({ vendor: "The Home Depot", date: "2026-11-02", amount: "1245.50", category_id: "c1" });
  });
  it("drops future, impossible and malformed dates", () => {
    for (const date of ["2027-01-01", "2026-02-31", "11/02/2026", "", "1999-05-05"]) expect(interpretReading({ ...raw, date }, cats, today).date).toBeNull();
  });
  it("drops zero, negative or unreadable totals", () => {
    for (const total of ["0", "", "abc", "-5"]) expect(interpretReading({ ...raw, total }, cats, today).amount).toBeNull();
  });
  it("only accepts a category that exists in the company's list", () => {
    expect(interpretReading({ ...raw, category: "Crypto mining" }, cats, today).category_id).toBeNull();
    expect(interpretReading({ ...raw, category: "" }, cats, today).category_id).toBeNull();
    expect(interpretReading({ ...raw, category: " Fuel And Travel " }, cats, today).category_id).toBe("c2");
  });
  it("reports whether anything usable came back", () => {
    expect(hasSuggestion(interpretReading(raw, cats, today))).toBe(true);
    expect(hasSuggestion(interpretReading({ vendor: "", date: "", total: "", category: "" }, cats, today))).toBe(false);
  });
});
