export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

/** Validates an uploaded logo (type and size). The bucket enforces the same limits. */
export function checkLogo(file: { type: string; size: number }): { ext: string } | { error: "type" | "size" } {
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { error: "type" };
  if (file.size > LOGO_MAX_BYTES) return { error: "size" };
  return { ext };
}
