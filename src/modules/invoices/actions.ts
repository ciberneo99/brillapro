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

/** New draft with the same lines as an existing invoice (repeat customers). */
export async function duplicateInvoice(id: string) {
  await guard();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_invoice", { p_id: id });
  if (error || !data) redirect(page(id, "?error=invalid"));
  revalidatePath("/invoices");
  redirect(page(data as string, "?saved=1"));
}

/** Saves the whole draft in one go: header, customer, and every line in the order shown on screen. */
export async function saveInvoiceDraft(id: string, formData: FormData) {
  await guard();
  const h = invoiceHeaderSchema.safeParse(raw(formData));
  let lines: unknown;
  try { lines = JSON.parse(String(formData.get("lines") ?? "[]")); } catch { lines = null; }
  if (!h.success || !Array.isArray(lines) || lines.length > 100) redirect(page(id, "?error=invalid"));
  // Rows left completely blank in the editor are ignored, not errors.
  const filled = lines.filter((l) => String(l?.description ?? "").trim() !== "" || String(l?.price ?? "").trim() !== "");
  const parsed = filled.map((l) => lineSchema.safeParse(l));
  if (parsed.some((p) => !p.success)) redirect(page(id, "?error=invalid"));
  const customerId = String(formData.get("customer_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_invoice_draft", {
    p_id: id,
    p_header: { ...h.data, customer_id: UUID.test(customerId) ? customerId : null },
    p_lines: parsed.map((p) => (p.success ? p.data : null)),
  });
  revalidatePath(page(id));
  revalidatePath("/invoices");
  redirect(page(id, error ? "?error=invalid" : "?saved=1"));
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

/** Sets the stored status by hand (Draft / Sent / Cancelled), e.g. when the invoice is texted instead of emailed. */
export async function setInvoiceStatus(id: string, status: string): Promise<{ ok: boolean; reason?: "payments" | "lines" | "missing" | "failed" }> {
  await guard();
  if (!UUID.test(id) || !["draft", "sent", "void"].includes(status)) return { ok: false, reason: "failed" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_invoice_status", { p_id: id, p_status: status });
  revalidatePath(page(id));
  revalidatePath("/invoices");
  if (!error) return { ok: true };
  const m = `${error.code ?? ""} ${error.message}`;
  return { ok: false, reason: /has payments/.test(m) ? "payments" : /no lines/.test(m) ? "lines" : /PGRST202|schema cache|does not exist/.test(m) ? "missing" : "failed" };
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

/** Edit a recorded payment (owner / admin, like deleting one). The database refuses totals above the invoice total. */
export async function updatePayment(id: string, paymentId: string, formData: FormData) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect(page(id));
  const p = paymentSchema.safeParse(raw(formData));
  if (!p.success || !UUID.test(paymentId)) redirect(page(id, "?error=payment"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_payment", {
    p_id: paymentId, p_amount: p.data.amount, p_date: p.data.paid_on, p_method: p.data.method, p_reference: p.data.reference, p_notes: p.data.notes ?? "",
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
