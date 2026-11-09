"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { getQuoteSettings } from "./queries";
import { lineSchema, optionSchema, quoteHeaderSchema, settingsSchema, TIERS } from "./schema";

const raw = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"));
const page = (id: string, q = "") => `/quotes/${id}${q}`;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function guard() {
  const ctx = await requireContext();
  if (!can(ctx.role, "quotes:write")) redirect("/quotes");
  return ctx;
}

export async function createQuote(formData: FormData) {
  const ctx = await guard();
  const customerId = String(formData.get("customer_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) redirect("/quotes/new?error=invalid");
  const serviceId = String(formData.get("service_type_id") ?? "");
  const tiers = formData.get("tiers") === "on";
  const s = await getQuoteSettings(ctx.tenant.id);
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + s.quote_valid_days);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      tenant_id: ctx.tenant.id, customer_id: customerId, created_by: ctx.userId,
      service_type_id: /^[0-9a-f-]{36}$/i.test(serviceId) ? serviceId : null,
      expires_on: isoDay(expires), tax_rate: s.default_tax_rate, terms: s.quote_terms,
    })
    .select("id").single();
  if (error || !data) redirect("/quotes/new?error=invalid");
  if (tiers) {
    await supabase.from("quote_options").insert(
      TIERS.map((name, i) => ({ tenant_id: ctx.tenant.id, quote_id: data.id, name, position: i + 1 })),
    );
  }
  revalidatePath("/quotes");
  redirect(page(data.id));
}

export async function updateQuote(id: string, formData: FormData) {
  await guard();
  const p = quoteHeaderSchema.safeParse(raw(formData));
  if (!p.success) redirect(page(id, "?error=invalid"));
  const supabase = await createClient();
  const { data, error } = await supabase.from("quotes").update(p.data).eq("id", id).select("id");
  revalidatePath(page(id));
  redirect(page(id, error || !data?.length ? "?error=invalid" : "?saved=1"));
}

export async function addOption(id: string, formData: FormData) {
  const ctx = await guard();
  const p = optionSchema.safeParse(raw(formData));
  if (!p.success) redirect(page(id, "?error=invalid"));
  const supabase = await createClient();
  const { data: last } = await supabase.from("quote_options").select("position").eq("quote_id", id).order("position", { ascending: false }).limit(1);
  const { error } = await supabase.from("quote_options").insert({ ...p.data, tenant_id: ctx.tenant.id, quote_id: id, position: (last?.[0]?.position ?? 0) + 1 });
  revalidatePath(page(id));
  redirect(page(id, error ? "?error=invalid" : ""));
}

export async function updateOption(id: string, optionId: string, formData: FormData) {
  await guard();
  const p = optionSchema.safeParse(raw(formData));
  if (!p.success) redirect(page(id, "?error=invalid"));
  const supabase = await createClient();
  const { error } = await supabase.from("quote_options").update(p.data).eq("id", optionId).eq("quote_id", id);
  revalidatePath(page(id));
  redirect(page(id, error ? "?error=invalid" : ""));
}

export async function deleteOption(id: string, optionId: string) {
  await guard();
  const supabase = await createClient();
  await supabase.from("quote_options").delete().eq("id", optionId).eq("quote_id", id);
  revalidatePath(page(id));
  redirect(page(id));
}

export async function addLine(id: string, formData: FormData) {
  const ctx = await guard();
  const p = lineSchema.safeParse(raw(formData));
  if (!p.success) redirect(page(id, "?error=invalid"));
  const supabase = await createClient();
  const { data: last } = await supabase.from("quote_lines").select("position").eq("quote_id", id).order("position", { ascending: false }).limit(1);
  const { error } = await supabase.from("quote_lines").insert({ ...p.data, tenant_id: ctx.tenant.id, quote_id: id, position: (last?.[0]?.position ?? 0) + 1 });
  revalidatePath(page(id));
  redirect(page(id, error ? "?error=invalid" : ""));
}

export async function updateLine(id: string, lineId: string, formData: FormData) {
  await guard();
  const p = lineSchema.safeParse(raw(formData));
  if (!p.success) redirect(page(id, "?error=invalid"));
  const supabase = await createClient();
  const { error } = await supabase.from("quote_lines").update(p.data).eq("id", lineId).eq("quote_id", id);
  revalidatePath(page(id));
  redirect(page(id, error ? "?error=invalid" : ""));
}

export async function deleteLine(id: string, lineId: string) {
  await guard();
  const supabase = await createClient();
  await supabase.from("quote_lines").delete().eq("id", lineId).eq("quote_id", id);
  revalidatePath(page(id));
  redirect(page(id));
}

/** Marks a draft as sent. Called right before the browser opens the user's own email app (mailto:). */
export async function markQuoteSent(id: string): Promise<{ ok: boolean }> {
  await guard();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_quote_status", { p_id: id, p_status: "sent" });
  revalidatePath(page(id));
  revalidatePath("/quotes");
  return { ok: !error };
}

export async function acceptQuote(id: string, formData: FormData) {
  await guard();
  const option = String(formData.get("option_id") ?? "") || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_quote_status", { p_id: id, p_status: "accepted", p_option: option });
  revalidatePath("/quotes");
  redirect(page(id, error ? "?error=option" : ""));
}

export async function declineQuote(id: string) {
  await guard();
  const supabase = await createClient();
  await supabase.rpc("set_quote_status", { p_id: id, p_status: "declined" });
  revalidatePath("/quotes");
  redirect(page(id));
}

export async function duplicateQuote(id: string) {
  await guard();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_quote", { p_id: id });
  if (error || !data) redirect(page(id, "?error=invalid"));
  revalidatePath("/quotes");
  redirect(page(data as string));
}

export async function deleteQuote(id: string) {
  await guard();
  const supabase = await createClient();
  await supabase.from("quotes").delete().eq("id", id);
  revalidatePath("/quotes");
  redirect("/quotes");
}

export async function saveQuoteSettings(formData: FormData) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect("/settings/quotes");
  const p = settingsSchema.safeParse(raw(formData));
  if (!p.success) redirect("/settings/quotes?error=1");
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_settings").update(p.data).eq("tenant_id", ctx.tenant.id);
  revalidatePath("/settings/quotes");
  redirect(error ? "/settings/quotes?error=1" : "/settings/quotes?saved=1");
}
