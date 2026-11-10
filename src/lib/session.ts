import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRole, type Role } from "@/lib/permissions";

export type AppContext = {
  userId: string;
  email: string;
  profile: { full_name: string; locale: "en" | "es"; theme: "light" | "dark" | "system" };
  tenant: { id: string; name: string; public_slug: string; accepts_requests: boolean };
  role: Role;
  settings: {
    currency: string; timezone: string; date_format: string; doc_locale: "en" | "es";
    phone: string | null; email: string | null; address: string | null; tax_id: string | null;
  };
  /** Whole days left in the free trial, or null when not trialing. */
  trialDaysLeft: number | null;
};

/** The authoritative identity for a request. The tenant comes from a verified membership
 *  (queried under RLS), never from anything the browser sends. */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser(); // verified with the auth server
  const user = userData.user;
  if (!user) return null;

  const { data: membership } = await supabase
    .from("memberships")
    .select("role, tenant:tenants(id, name, public_slug, accepts_requests)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const tenant = Array.isArray(membership?.tenant) ? membership?.tenant[0] : membership?.tenant;
  if (!membership || !tenant || !isRole(membership.role)) return null;

  const [{ data: profile }, { data: settings }, { data: sub }] = await Promise.all([
    supabase.from("profiles").select("full_name, locale, theme").eq("id", user.id).single(),
    supabase.from("tenant_settings").select("currency, timezone, date_format, doc_locale, phone, email, address, tax_id").eq("tenant_id", tenant.id).single(),
    supabase.from("subscriptions").select("status, trial_ends_at").eq("tenant_id", tenant.id).maybeSingle(),
  ]);
  if (!profile || !settings) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    profile: profile as AppContext["profile"],
    tenant: { id: tenant.id, name: tenant.name, public_slug: tenant.public_slug, accepts_requests: tenant.accepts_requests },
    role: membership.role,
    settings: settings as AppContext["settings"],
    trialDaysLeft:
      sub?.status === "trialing" && sub.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86_400_000))
        : null,
  };
});

/** For pages/actions inside the private app: signed in + belongs to a company, or redirect. */
export async function requireContext(): Promise<AppContext> {
  const ctx = await getAppContext();
  if (ctx) return ctx;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user && (await supabase.rpc("my_company_suspended")).data === true) redirect("/suspended");
  redirect(data.user ? "/onboarding" : "/login");
}
