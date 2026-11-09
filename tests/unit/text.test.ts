import { describe, expect, it } from "vitest";
import { capitalizeWords, normalizeAddress, normalizeName, normalizeState } from "@/lib/text";

describe("capitalizeWords (live typing)", () => {
  it("raises the first letter of every word", () => {
    expect(capitalizeWords("neopolo ruiz santiago")).toBe("Neopolo Ruiz Santiago");
    expect(capitalizeWords("main st. austin, texas")).toBe("Main St. Austin, Texas");
    expect(capitalizeWords("austin,texas")).toBe("Austin,Texas");
  });
  it("never lowers or alters the rest of a word", () => {
    expect(capitalizeWords("McDonald")).toBe("McDonald");
    expect(capitalizeWords("123 NW Oak PO Box")).toBe("123 NW Oak PO Box");
    expect(capitalizeWords("ANA")).toBe("ANA");
  });
  it("handles hyphens, apostrophes and accents", () => {
    expect(capitalizeWords("mary-jane")).toBe("Mary-Jane");
    expect(capitalizeWords("o'brien")).toBe("O'Brien");
    expect(capitalizeWords("john's")).toBe("John's");
    expect(capitalizeWords("álvaro núñez")).toBe("Álvaro Núñez");
    expect(capitalizeWords("ñandú")).toBe("Ñandú");
  });
  it("leaves numbers and ordinals alone", () => {
    expect(capitalizeWords("123 main st apt 4b")).toBe("123 Main St Apt 4b");
    expect(capitalizeWords("2nd ave")).toBe("2nd Ave");
  });
  it("keeps spaces while typing (does not trim)", () => {
    expect(capitalizeWords("ana ")).toBe("Ana ");
    expect(capitalizeWords("")).toBe("");
  });
});

describe("final normalization", () => {
  it("collapses spaces and trims", () => {
    expect(normalizeName("  neopolo   ruiz ")).toBe("Neopolo Ruiz");
    expect(normalizeAddress("123  main st.   austin")).toBe("123 Main St. Austin");
  });
  it("states: two letters become uppercase, names get capitalized", () => {
    expect(normalizeState("tx")).toBe("TX");
    expect(normalizeState("Tx")).toBe("TX");
    expect(normalizeState("texas")).toBe("Texas");
    expect(normalizeState("new mexico")).toBe("New Mexico");
    expect(normalizeState("")).toBe("");
  });
});
