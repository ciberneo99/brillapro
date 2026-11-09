import { describe, expect, it } from "vitest";
import { formatMoneyFinal, formatMoneyTyping, groupInteger } from "@/lib/numbers";
import { formatZipTyping, normalizeZip } from "@/lib/zip";
import { capitalizeSentences, normalizeSentences } from "@/lib/text";
import { customerFormSchema } from "@/modules/customers/schema";

const base = { first_name: "Ana" };
const parse = (o: Record<string, string>) => customerFormSchema.safeParse({ ...base, ...o });

describe("money field", () => {
  it("groups thousands and limits to two decimals while typing", () => {
    expect(formatMoneyTyping("1250")).toBe("1,250");
    expect(formatMoneyTyping("1250.5")).toBe("1,250.5");
    expect(formatMoneyTyping("1250.567")).toBe("1,250.56");
    expect(formatMoneyTyping("12a3b")).toBe("123");
    expect(formatMoneyTyping("1.2.3")).toBe("1.23");
    expect(formatMoneyTyping(".5")).toBe("0.5");
    expect(formatMoneyTyping("")).toBe("");
  });
  it("always shows two decimals when you leave the field", () => {
    expect(formatMoneyFinal("1250")).toBe("1,250.00");
    expect(formatMoneyFinal("1,250.5")).toBe("1,250.50");
    expect(formatMoneyFinal("0")).toBe("0.00");
    expect(formatMoneyFinal("")).toBe("");
    expect(formatMoneyFinal(".")).toBe("");
  });
  it("the server turns the displayed value into exact cents", () => {
    const r = parse({ estimated_price: "1,250.50" });
    expect(r.success && r.data.estimated_price_cents).toBe(125050);
  });
});

describe("square footage", () => {
  it("groups digits and the server accepts the grouped value", () => {
    expect(groupInteger("1800")).toBe("1,800");
    expect(groupInteger("1,800ft")).toBe("1,800");
    expect(groupInteger("007")).toBe("7");
    const r = parse({ square_footage: "1,800" });
    expect(r.success && r.data.square_footage).toBe(1800);
    expect(parse({ square_footage: "0" }).success).toBe(false);
  });
});

describe("ZIP code", () => {
  it("types as digits with an automatic hyphen", () => {
    expect(formatZipTyping("78701")).toBe("78701");
    expect(formatZipTyping("787011234")).toBe("78701-1234");
    expect(formatZipTyping("78a70")).toBe("7870");
    expect(formatZipTyping("1234567890123")).toBe("12345-6789");
  });
  it("server accepts 5 or 9 digits and rejects the rest", () => {
    expect(normalizeZip("78701")).toBe("78701");
    expect(normalizeZip("787011234")).toBe("78701-1234");
    expect(normalizeZip("")).toBeNull();
    expect(normalizeZip("7870")).toBe("invalid");
    expect(normalizeZip("78701-12")).toBe("invalid");
    expect(parse({ zip_code: "78701" }).success).toBe(true);
    expect(parse({ zip_code: "123" }).success).toBe(false);
  });
});

describe("sentence case for free text", () => {
  it("raises the first letter of each sentence and nothing else", () => {
    expect(capitalizeSentences("dog named max. he is friendly! ask for ana")).toBe("Dog named max. He is friendly! Ask for ana");
    expect(capitalizeSentences("line one\nline two")).toBe("Line one\nLine two");
    expect(capitalizeSentences("use the iPhone app. NASA ok")).toBe("Use the iPhone app. NASA ok");
    expect(capitalizeSentences("3.5 baths")).toBe("3.5 baths");
  });
  it("server tidies spaces and keeps paragraphs", () => {
    expect(normalizeSentences("  key under mat.   call first  ")).toBe("Key under mat. Call first");
    expect(normalizeSentences("a\n\n\n\nb")).toBe("A\n\nB");
  });
  it("applies to pets, notes and instructions on the server", () => {
    const r = parse({ pets: "two cats", notes: "prefers mornings. no bleach", access_instructions: "key in lockbox" });
    expect(r.success && r.data).toMatchObject({ pets: "Two cats", notes: "Prefers mornings. No bleach", access_instructions: "Key in lockbox" });
  });
});
