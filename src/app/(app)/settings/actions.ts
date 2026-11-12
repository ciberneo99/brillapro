"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { isValidEmail } from "@/lib/email";
import { normalizeAddress } from "@/lib/text";
import { normalizeWebsite } from "@/lib/business";
import { normalizeZip } from "@/lib/zip";
import { checkLogo } from "@/lib/logo";
import { DEFAULT_BRAND, isHexColor, isLogoSize } from "@/lib/brand-color";
import { dominantLogoColor } from "@/lib/logo-color";
import { getBrand, logoForPdf } from "@/lib/logo-server";
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
  city: optional(80),
  state: optional(40),
  zip_code: z.string().trim().max(12).transform((v, ctx) => {
    const zip = normalizeZip(v);
    if (zip === "invalid") { ctx.addIssue({ code: "custom", message: "zip" }); return z.NEVER; }
    return zip;
  }),
  website: z.string().trim().max(200).transform((v, ctx) => {
    const w = normalizeWebsite(v);
    if (w === "invalid") { ctx.addIssue({ code: "custom", message: "website" }); return z.NEVER; }
    return w;
  }),
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

/** Uploads the company logo (PNG/JPG, up to 1 MB) to the private bucket and links it. */
export async function uploadLogo(formData: FormData) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect("/settings");
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) redirect("/settings?logo=type");
  const check = checkLogo(file);
  if ("error" in check) redirect(`/settings?logo=${check.error}`);
  const supabase = await createClient();
  const path = `${ctx.tenant.id}/${randomUUID()}.${check.ext}`;
  const { error } = await supabase.storage.from("logos").upload(path, file, { contentType: file.type, upsert: false });
  if (error) redirect("/settings?logo=upload");
  // The brand color follows the new logo on its own; it can be changed afterwards in Settings.
  const color = await dominantLogoColor(Buffer.from(await file.arrayBuffer())).catch(() => null);
  const { error: linkError } = await supabase.from("tenant_settings").update({ logo_path: path, ...(color ? { brand_color: color } : {}) }).eq("tenant_id", ctx.tenant.id);
  if (linkError) {
    await supabase.storage.from("logos").remove([path]);
    redirect("/settings?logo=upload");
  }
  if (ctx.settings.logo_path) await supabase.storage.from("logos").remove([ctx.settings.logo_path]);
  revalidatePath("/", "layout");
  redirect("/settings?logo=saved");
}

export async function removeLogo() {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect("/settings");
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_settings").update({ logo_path: null }).eq("tenant_id", ctx.tenant.id);
  if (!error && ctx.settings.logo_path) await supabase.storage.from("logos").remove([ctx.settings.logo_path]);
  revalidatePath("/", "layout");
  redirect("/settings?logo=removed");
}

/** Brand color and logo size for invoices and quotes. */
export async function saveBrand(formData: FormData) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect("/settings");
  const color = String(formData.get("brand_color") ?? "").trim().toLowerCase();
  const size = String(formData.get("logo_size") ?? "");
  if (!isHexColor(color) || !isLogoSize(size)) redirect("/settings?logo=badcolor");
  const current = await getBrand(ctx.tenant.id);
  // Saving only a new size must not turn the automatic default into a chosen color.
  const keepDefault = current.color === null && color === DEFAULT_BRAND;
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_settings").update({ ...(keepDefault ? {} : { brand_color: color }), logo_size: size }).eq("tenant_id", ctx.tenant.id);
  revalidatePath("/settings");
  redirect(error ? "/settings?logo=badcolor" : "/settings?logo=brand");
}

/** "Match my logo": reads the color of the current logo again. */
export async function matchLogoColor() {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect("/settings");
  const logo = await logoForPdf(ctx.settings.logo_path);
  const color = logo ? await dominantLogoColor(logo.data).catch(() => null) : null;
  if (!color) redirect("/settings?logo=nocolor");
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_settings").update({ brand_color: color }).eq("tenant_id", ctx.tenant.id);
  revalidatePath("/settings");
  redirect(error ? "/settings?logo=badcolor" : "/settings?logo=brand");
}

/** Back to the app green. */
export async function resetBrandColor() {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect("/settings");
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_settings").update({ brand_color: null }).eq("tenant_id", ctx.tenant.id);
  revalidatePath("/settings");
  redirect(error ? "/settings?logo=badcolor" : "/settings?logo=brandreset");
}
