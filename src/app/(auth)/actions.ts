"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { resolveLocale } from "@/i18n/request";
import { LOCALE_COOKIE, THEME_COOKIE } from "@/i18n/config";

/** `error` is a key under the "auth" / "onboarding" message namespaces; `done` shows a success state. */
export type FormState = { error?: string; done?: boolean } | undefined;

const email = z.string().trim().toLowerCase().pipe(z.email());
const password = z.string().min(8).max(72);

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1) }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalidCredentials" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "invalidCredentials" }; // same message: no account enumeration

  // Carry the saved preferences to this device.
  const { data: profile } = await supabase.from("profiles").select("locale, theme").eq("id", data.user.id).maybeSingle();
  if (profile) {
    const store = await cookies();
    const opts = { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" as const };
    store.set(LOCALE_COOKIE, profile.locale, opts);
    store.set(THEME_COOKIE, profile.theme, opts);
  }
  redirect("/dashboard");
}

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ full_name: z.string().trim().min(2).max(120), email, password })
    .safeParse({
      full_name: formData.get("full_name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === "email" ? "invalidEmail" : field === "password" ? "passwordShort" : "nameRequired" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
    },
  });
  if (error) return { error: "emailTaken" };
  if (data.session) redirect("/onboarding"); // email confirmation disabled
  return { done: true }; // confirmation email sent
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "invalidEmail" };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });
  return { done: true }; // identical response whether or not the account exists
}

export async function updatePassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = password.safeParse(formData.get("password"));
  if (!parsed.success) return { error: "passwordShort" };
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { error: "callbackError" };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "callbackError" };
  redirect("/dashboard");
}

export async function createWorkspace(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.string().trim().min(2).max(120).safeParse(formData.get("company"));
  if (!parsed.success) return { error: "nameInvalid" };

  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) redirect("/login");

  // Single atomic SECURITY DEFINER function: tenant + owner membership + settings + trial + audit.
  const { error } = await supabase.rpc("create_tenant", { p_name: parsed.data, p_locale: await resolveLocale() });
  if (error) return { error: "genericError" };
  redirect("/dashboard");
}
