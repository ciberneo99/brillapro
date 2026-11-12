import { describe, expect, it } from "vitest";
import { niceTicks } from "@/components/dashboard/charts";

describe("niceTicks", () => {
  it("gives distinct ticks even for an empty chart", () => {
    for (const max of [0, 1, 3, 500, 9_999]) {
      const t = niceTicks(max);
      expect(new Set(t).size).toBe(t.length);
    }
    expect(niceTicks(0)).toEqual([0, 2500, 5000, 7500, 10000]);
  });

  it("keeps tidy ticks for real amounts", () => {
    expect(niceTicks(250_000)).toEqual([0, 100000, 200000, 300000, 400000]);
  });
});
