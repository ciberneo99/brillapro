"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, THEME_COOKIE, isLocale, isTheme } from "@/i18n/config";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Saves interface language / theme: cookie (instant, works signed-out) + profile (follows the user). */
export async function savePreferences(input: { locale?: string; theme?: string }) {
  const store = await cookies();
  const patch: { locale?: string; theme?: string } = {};

  if (input.locale !== undefined) {
    if (!isLocale(input.locale)) return { ok: false as const };
    store.set(LOCALE_COOKIE, input.locale, { maxAge: ONE_YEAR, path: "/", sameSite: "lax" });
    patch.locale = input.locale;
  }
  if (input.theme !== undefined) {
    if (!isTheme(input.theme)) return { ok: false as const };
    store.set(THEME_COOKIE, input.theme, { maxAge: ONE_YEAR, path: "/", sameSite: "lax" });
    patch.theme = input.theme;
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user && Object.keys(patch).length) {
    // RLS: a user can only update their own profile row.
    await supabase.from("profiles").update(patch).eq("id", data.user.id);
  }
  revalidatePath("/", "layout");
  return { ok: true as const };
}
