"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { isValidEmail } from "@/lib/email";
import { normalizeAddress } from "@/lib/text";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";

export type SettingsState = { error?: "notAllowed" | "genericError"; saved?: boolean } | undefined;

const optional = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v));

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).transform((v) => (v === "" ? null : normalizePhone(v))),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().refine(isValidEmail)]).transform((v) => (v === "" ? null : v)),
  address: z.string().trim().max(300).transform((v) => (v === "" ? null : normalizeAddress(v))),
  tax_id: optional(60),
  currency: z.string().trim().toUpperCase().length(3),
  timezone: z.string().trim().min(1).max(60).refine((tz) => {
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
  }),
  date_format: z.enum(["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]),
  doc_locale: z.enum(["en", "es"]),
});

export async function saveBusinessSettings(_: SettingsState, formData: FormData): Promise<SettingsState> {
  const ctx = await requireContext();
  // 1st barrier: role check on the server. 2nd barrier: RLS in the database.
  if (!can(ctx.role, "settings:write")) return { error: "notAllowed" };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "genericError" };
  const { name, ...settings } = parsed.data;

  const supabase = await createClient();
  // tenant id comes from the verified membership, never from the form.
  const [t, s] = await Promise.all([
    supabase.from("tenants").update({ name }).eq("id", ctx.tenant.id).select("id"),
    supabase.from("tenant_settings").update(settings).eq("tenant_id", ctx.tenant.id).select("tenant_id"),
  ]);
  if (t.error || s.error || !t.data?.length || !s.data?.length) return { error: "genericError" };

  await supabase.from("audit_log").insert({
    tenant_id: ctx.tenant.id,
    actor_id: ctx.userId,
    action: "settings.updated",
    entity: "tenant_settings",
    entity_id: ctx.tenant.id,
  });

  revalidatePath("/", "layout");
  return { saved: true };
}
