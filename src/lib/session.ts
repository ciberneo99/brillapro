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
    logo_path: string | null;
    city: string | null; state: string | null; zip_code: string | null; website: string | null;
  };
  /** Whole days left in the free trial, or null when not trialing. */
  trialDaysLeft: number | null;
  /** The company's plan ('starter', 'pro', 'trial'...), or null when unknown. */
  planId: string | null;
};

/** The authoritative identity for a request. The signed token is verified locally (signature and expiry, no call to the
 *  auth server), and the tenant comes from a verified membership read under RLS (`my_app_context`, one database call),
 *  never from anything the browser sends. */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims?.sub) return null;

  const { data } = await supabase.rpc("my_app_context");
  const c = data as {
    role: string;
    tenant: AppContext["tenant"];
    profile: AppContext["profile"] | null;
    settings: AppContext["settings"] | null;
    sub: { status: string; trial_ends_at: string | null; plan_id: string } | null;
  } | null;
  if (!c || !c.tenant || !isRole(c.role) || !c.profile || !c.settings) return null;

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    profile: c.profile,
    tenant: { id: c.tenant.id, name: c.tenant.name, public_slug: c.tenant.public_slug, accepts_requests: c.tenant.accepts_requests },
    role: c.role,
    settings: c.settings,
    planId: c.sub?.plan_id ?? null,
    trialDaysLeft:
      c.sub?.status === "trialing" && c.sub.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(c.sub.trial_ends_at).getTime() - Date.now()) / 86_400_000))
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

/** True when the signed-in user is platform staff (listed in platform_admins). Decided by the database, never by the browser. */
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
});
