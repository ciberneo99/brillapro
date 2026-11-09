import "server-only";
import { cookies } from "next/headers";
import { THEME_COOKIE, isTheme, type Theme } from "@/i18n/config";

export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : "system";
}
