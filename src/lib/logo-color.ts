import sharp from "sharp";
import { toHex } from "./brand-color";

/**
 * The main color of a logo, as #rrggbb, or null when the image has no usable color (empty, fully transparent or all white).
 *
 * White and near-white are the page, and transparent pixels are the background, so both are ignored. Among the colorful
 * pixels the most common hue family wins and its average is returned (shades of the same hue merge, so a gradient does not
 * split the vote). A logo with no color at all (black or gray) gets the average of its dark pixels.
 */
export async function dominantLogoColor(image: Buffer): Promise<string | null> {
  const { data } = await sharp(image, { failOn: "none" }).resize(96, 96, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const HUES = 12;
  const bucket = Array.from({ length: HUES }, () => ({ n: 0, r: 0, g: 0, b: 0 }));
  const dark = { n: 0, r: 0, g: 0, b: 0 };
  let opaque = 0;
  let colorful = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // transparent: background
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (min >= 235) continue; // white / near white: the page
    opaque++;
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat >= 0.28 && max >= 50) {
      let h: number;
      const d = max - min;
      if (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      const k = Math.min(HUES - 1, Math.floor((h / 6) * HUES));
      bucket[k].n++; bucket[k].r += r; bucket[k].g += g; bucket[k].b += b;
      colorful++;
    } else {
      dark.n++; dark.r += r; dark.g += g; dark.b += b;
    }
  }
  if (opaque === 0) return null;

  // Enough colorful pixels (not just anti-aliasing at the edges): the biggest hue family wins.
  if (colorful >= Math.max(4, opaque * 0.03)) {
    const best = bucket.reduce((a, c) => (c.n > a.n ? c : a));
    return toHex([best.r / best.n, best.g / best.n, best.b / best.n]);
  }
  if (dark.n === 0) return null;
  const avg: [number, number, number] = [dark.r / dark.n, dark.g / dark.n, dark.b / dark.n];
  return avg[0] > 225 && avg[1] > 225 && avg[2] > 225 ? null : toHex(avg);
}
