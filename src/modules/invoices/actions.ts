"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { todayIso, addDays } from "@/lib/calendar";
import { lineSchema } from "@/modules/quotes/schema";
import { getInvoiceSettings } from "./queries";
import { invoiceHeaderSchema, invoiceSettingsSchema, paymentSchema } from "./schema";

const UUID = /^[0-9a-f-]{36}$/i;
const raw = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"));
const page = (id: string, q = "") => `/invoices/${id}${q}`;

async function guard() {
  const ctx = await requireContext();
  if (!can(ctx.role, "invoices:write")) redirect("/invoices");
  return ctx;
}

export async function createInvoice(formData: FormData) {
  const ctx = await guard();
  const customerId = String(formData.get("customer_id") ?? "");
  if (!UUID.test(customerId)) redirect("/invoices/new?error=invalid");
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("customers").select("first_name,last_name,company_name,email,billing_address,service_address,city,state,zip_code").eq("id", customerId).single();
  if (!c) redirect("/invoices/new?error=invalid");
  const s = await getInvoiceSettings(ctx.tenant.id);
  const today = todayIso(ctx.settings.timezone);
  const address = [c.billing_address || c.service_address, c.city, [c.state, c.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      tenant_id: ctx.tenant.id, customer_id: customerId, created_by: ctx.userId, issue_date: today, due_date: addDays(today, s.invoice_due_days),
      customer_name: `${c.first_name} ${c.last_name}`.trim() || c.company_name, customer_email: c.email, billing_address: address,
      tax_rate: s.default_tax_rate, terms: s.invoice_terms,
    })
    .select("id").single();
  if (error || !data) redirect("/invoices/new?error=invalid");
  revalidatePath("/invoices");
  redirect(page(data.id));
}

export async function createInvoiceFromJob(jobId: string) {
  await guard();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice_from_job", { p_job: jobId });
  if (error || !data) redirect(`/jobs/${jobId}?error=invoice`);
  revalidatePath("/invoices");
  redirect(page(data as string));
}

export async function updateInvoice(id: string, formData: FormData) {
  await guard();
  const p = invoiceHeaderSchema.safeParse(raw(formData));
  if (!p.success) redirect(page(id, "?error=invalid"));
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoices").update(p.data).eq("id", id).select("id");
  revalidatePath(page(id));
  redirect(page(id, error || !data?.length ? "?error=invalid" : "?saved=1"));
}

export async function addInvoiceLine(id: string, formData: FormData) {
  const ctx = await guard();
  const p = lineSchema.safeParse(raw(formData));
  if (!p.success) redirect(page(id, "?error=invalid"));
  const supabase = await createClient();
  const { data: last } = await supabase.from("invoice_lines").select("position").eq("invoice_id", id).order("position", { ascending: false }).limit(1);
  const { error } = await supabase.from("invoice_lines").insert({ ...p.data, tenant_id: ctx.tenant.id, invoice_id: id, position: (last?.[0]?.position ?? 0) + 1 });
  revalidatePath(page(id));
  redirect(page(id, error ? "?error=invalid" : ""));
}

export async function updateInvoiceLine(id: string, lineId: string, formData: FormData) {
  await guard();
  const p = lineSchema.safeParse(raw(formData));
  if (!p.success) redirect(page(id, "?error=invalid"));
  const supabase = await createClient();
  const { error } = await supabase.from("invoice_lines").update(p.data).eq("id", lineId).eq("invoice_id", id);
  revalidatePath(page(id));
  redirect(page(id, error ? "?error=invalid" : ""));
}

export async function deleteInvoiceLine(id: string, lineId: string) {
  await guard();
  const supabase = await createClient();
  await supabase.from("invoice_lines").delete().eq("id", lineId).eq("invoice_id", id);
  revalidatePath(page(id));
  redirect(page(id));
}

/** Issues a draft (marks it sent). Called right before the browser opens the user's own email app. */
export async function markInvoiceSent(id: string): Promise<{ ok: boolean }> {
  await guard();
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_invoice", { p_id: id });
  revalidatePath(page(id));
  revalidatePath("/invoices");
  return { ok: !error };
}

export async function issueInvoice(id: string) {
  await guard();
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_invoice", { p_id: id });
  revalidatePath("/invoices");
  redirect(page(id, error ? "?error=issue" : ""));
}

export async function voidInvoice(id: string) {
  await guard();
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_invoice", { p_id: id });
  revalidatePath("/invoices");
  redirect(page(id, error ? "?error=void" : ""));
}

export async function deleteInvoice(id: string) {
  await guard();
  const supabase = await createClient();
  await supabase.from("invoices").delete().eq("id", id);
  revalidatePath("/invoices");
  redirect("/invoices");
}

export async function recordPayment(id: string, formData: FormData) {
  await guard();
  const p = paymentSchema.safeParse(raw(formData));
  if (!p.success) redirect(page(id, "?error=payment"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment", {
    p_invoice: id, p_amount: p.data.amount, p_date: p.data.paid_on, p_method: p.data.method, p_reference: p.data.reference, p_notes: p.data.notes ?? "",
  });
  revalidatePath(page(id));
  revalidatePath("/invoices");
  redirect(page(id, error ? "?error=payment" : "?saved=1"));
}

export async function deletePayment(id: string, paymentId: string) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect(page(id)); // owner / admin only (matches the database policy)
  const supabase = await createClient();
  await supabase.from("payments").delete().eq("id", paymentId).eq("invoice_id", id);
  revalidatePath(page(id));
  revalidatePath("/invoices");
  redirect(page(id));
}

export async function saveInvoiceSettings(formData: FormData) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect("/settings/invoices");
  const p = invoiceSettingsSchema.safeParse(raw(formData));
  if (!p.success) redirect("/settings/invoices?error=1");
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_settings").update(p.data).eq("tenant_id", ctx.tenant.id);
  revalidatePath("/settings/invoices");
  redirect(error ? "/settings/invoices?error=1" : "/settings/invoices?saved=1");
}
