import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { contrastWithWhite, DEFAULT_BRAND, isHexColor, LOGO_DIMS, readableOnWhite } from "@/lib/brand-color";
import { dominantLogoColor } from "@/lib/logo-color";

const png = (w: number, h: number, bg: { r: number; g: number; b: number; alpha: number }, shapes: { x: number; y: number; w: number; h: number; c: string }[] = []) =>
  sharp({ create: { width: w, height: h, channels: 4, background: bg } })
    .composite(shapes.map((s) => ({ input: { create: { width: s.w, height: s.h, channels: 3 as const, background: s.c } }, left: s.x, top: s.y })))
    .png().toBuffer();
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/** Which of the three channels is clearly the biggest. */
const mainChannel = (hex: string) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return ["r", "g", "b"][v.indexOf(Math.max(...v))]; };

describe("dominantLogoColor", () => {
  it("picks the color of a logo on a white background", async () => {
    const c = await dominantLogoColor(await png(200, 100, WHITE, [{ x: 20, y: 20, w: 100, h: 60, c: "#1d4ed8" }]));
    expect(isHexColor(c)).toBe(true);
    expect(mainChannel(c!)).toBe("b");
  });

  it("ignores a transparent background", async () => {
    const c = await dominantLogoColor(await png(200, 100, CLEAR, [{ x: 10, y: 10, w: 120, h: 60, c: "#dc2626" }]));
    expect(mainChannel(c!)).toBe("r");
  });

  it("takes the biggest color, not a small accent", async () => {
    const c = await dominantLogoColor(await png(200, 100, WHITE, [{ x: 10, y: 10, w: 150, h: 70, c: "#16a34a" }, { x: 170, y: 10, w: 20, h: 20, c: "#dc2626" }]));
    expect(mainChannel(c!)).toBe("g");
  });

  it("gives a dark neutral for a black logo, and nothing for an empty one", async () => {
    const black = await dominantLogoColor(await png(100, 100, WHITE, [{ x: 10, y: 10, w: 80, h: 80, c: "#111111" }]));
    expect(black).toMatch(/^#[0-3][0-9a-f][0-3][0-9a-f][0-3][0-9a-f]$/);
    expect(await dominantLogoColor(await png(100, 100, WHITE))).toBeNull();
    expect(await dominantLogoColor(await png(100, 100, CLEAR))).toBeNull();
  });

  it("reads JPEG too", async () => {
    const jpg = await sharp(await png(120, 120, WHITE, [{ x: 10, y: 10, w: 100, h: 100, c: "#7c3aed" }])).jpeg().toBuffer();
    expect(isHexColor(await dominantLogoColor(jpg))).toBe(true);
  });
});

describe("readableOnWhite", () => {
  it("keeps colors that already read well and darkens light ones", () => {
    expect(readableOnWhite("#0b7a75")).toBe("#0b7a75");
    const yellow = readableOnWhite("#facc15");
    expect(yellow).not.toBe("#facc15");
    expect(contrastWithWhite(yellow)).toBeGreaterThanOrEqual(4.5);
    expect(readableOnWhite("#ffffff")).not.toBe("#ffffff");
  });
  it("falls back to the app green for anything that is not a color", () => {
    expect(readableOnWhite("red")).toBe(DEFAULT_BRAND);
  });
  it("logo sizes never overflow the page width", () => {
    for (const d of Object.values(LOGO_DIMS)) expect(d.left + d.mid + d.right).toBe(100);
  });
});
