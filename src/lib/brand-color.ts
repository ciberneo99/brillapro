/** The green of the app. Used on invoices and quotes until a company has a brand color of its own. */
export const DEFAULT_BRAND = "#0b7a75";

export const LOGO_SIZES = ["small", "medium", "large"] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];
export const isLogoSize = (v: unknown): v is LogoSize => typeof v === "string" && (LOGO_SIZES as readonly string[]).includes(v);

/** How the logo is drawn on the PDF (points), and how the three header columns share the page width (%). */
export const LOGO_DIMS: Record<LogoSize, { h: number; w: number; left: number; mid: number; right: number }> = {
  small: { h: 60, w: 120, left: 30, mid: 36, right: 34 },
  medium: { h: 80, w: 150, left: 30, mid: 36, right: 34 },
  large: { h: 100, w: 200, left: 38, mid: 30, right: 32 },
};

export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/.test(v);

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
export const toHex = ([r, g, b]: Rgb): string => "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** WCAG contrast of a color against white. */
export const contrastWithWhite = (hex: string): number => 1.05 / (luminance(toRgb(hex)) + 0.05);

/**
 * The color to actually print. The table header and the balance bar carry white text, so a light brand color
 * (yellow, light blue...) is darkened, keeping its hue, until the white text is easy to read.
 */
export function readableOnWhite(hex: string, minContrast = 4.5): string {
  if (!isHexColor(hex)) return DEFAULT_BRAND;
  let rgb = toRgb(hex);
  for (let i = 0; i < 40 && contrastWithWhite(toHex(rgb)) < minContrast; i++) rgb = rgb.map((v) => v * 0.94) as Rgb;
  return toHex(rgb);
}

/** Text color to print on top of a brand-colored area: white, or near-black when the color is too light for white. */
export const textOn = (hex: string): string => (isHexColor(hex) && contrastWithWhite(hex) < 3 ? "#1f2937" : "#ffffff");
