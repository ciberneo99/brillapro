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
const UUID = /^[0-9a-f-]{36}$/i;
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

/** Saves the whole draft from the editor: header, options and extra items in their on-screen order, in one transaction. */
export async function saveQuoteDraft(id: string, formData: FormData) {
  await guard();
  const h = quoteHeaderSchema.safeParse(raw(formData));
  const list = (key: string): unknown[] | null => {
    try { const v = JSON.parse(String(formData.get(key) ?? "[]")); return Array.isArray(v) ? v : null; } catch { return null; }
  };
  const options = list("options");
  const lines = list("lines");
  if (!h.success || !options || !lines || options.length > 12 || lines.length > 100) redirect(page(id, "?error=invalid"));
  // Rows left completely blank in the editor are ignored, not errors.
  const blank = (r: unknown, keys: string[]) => keys.every((k) => String((r as Record<string, unknown>)?.[k] ?? "").trim() === "");
  const opts = options.filter((o) => !blank(o, ["name", "description", "price"])).map((o) => optionSchema.safeParse(o));
  const extra = lines.filter((l) => !blank(l, ["description", "price"])).map((l) => lineSchema.safeParse(l));
  if (opts.some((p) => !p.success) || extra.some((p) => !p.success)) redirect(page(id, "?error=invalid"));
  const customerId = String(formData.get("customer_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_quote_draft", {
    p_id: id,
    p_header: { ...h.data, customer_id: UUID.test(customerId) ? customerId : null },
    p_options: opts.map((p) => (p.success ? p.data : null)),
    p_lines: extra.map((p) => (p.success ? p.data : null)),
  });
  revalidatePath(page(id));
  revalidatePath("/quotes");
  redirect(page(id, error ? "?error=invalid" : "?saved=1"));
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
