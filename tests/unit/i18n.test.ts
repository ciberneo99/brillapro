import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("i18n catalogs", () => {
  it("English and Spanish define exactly the same keys", () => {
    const e = new Set(keys(en));
    const s = new Set(keys(es));
    expect([...e].filter((k) => !s.has(k))).toEqual([]);
    expect([...s].filter((k) => !e.has(k))).toEqual([]);
  });

  it("no translation is empty", () => {
    for (const cat of [en, es]) for (const k of keys(cat)) expect(k).toBeTruthy();
  });
});
