import "server-only";
import { createClient } from "@/lib/supabase/server";
import { INVOICE_STATUSES, type InvoiceTotals } from "./schema";

export const PAGE_SIZE = 25;

export type InvoiceSettings = { invoice_prefix: string; invoice_due_days: number; invoice_terms: string | null; default_tax_rate: number };

export async function getInvoiceSettings(tenantId: string): Promise<InvoiceSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_settings").select("invoice_prefix,invoice_due_days,invoice_terms,default_tax_rate").eq("tenant_id", tenantId).single();
  return {
    invoice_prefix: data?.invoice_prefix ?? "INV-", invoice_due_days: data?.invoice_due_days ?? 15,
    invoice_terms: data?.invoice_terms ?? null, default_tax_rate: Number(data?.default_tax_rate ?? 0),
  };
}

export type InvoiceListRow = {
  id: string; number: number; status: string; display_status: string; due_date: string; customer_name: string; customer_id: string;
  total_cents: number | null; balance_cents: number | null;
};

export async function listInvoices(params: { status?: string; customerId?: string; page?: number }) {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(params.page ?? 1));
  let q = supabase
    .from("invoices_overview")
    .select("id,number,status,display_status,due_date,customer_name,customer_id,total_cents,balance_cents", { count: "exact" });
  if (params.status && (INVOICE_STATUSES as readonly string[]).includes(params.status)) q = q.eq("display_status", params.status);
  if (params.customerId) q = q.eq("customer_id", params.customerId);
  const { data, count } = await q.order("number", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  return { rows: (data ?? []) as InvoiceListRow[], total: count ?? 0, page };
}

/** Money still owed on issued invoices (open + overdue), for the list header. */
export async function outstanding(): Promise<{ open: number; overdue: number }> {
  const supabase = await createClient();
  const { data } = await supabase.from("invoices_overview").select("display_status,balance_cents").in("display_status", ["sent", "partial", "overdue"]);
  let open = 0, overdue = 0;
  for (const r of data ?? []) {
    open += Number(r.balance_cents ?? 0);
    if (r.display_status === "overdue") overdue += Number(r.balance_cents ?? 0);
  }
  return { open, overdue };
}

export type InvoiceLine = { id: string; description: string; quantity: number; unit_price_cents: number; position: number };
export type Payment = { id: string; amount_cents: number; paid_on: string; method: string; reference: string | null; notes: string | null };
export type InvoiceDetail = {
  id: string; number: number; status: string; display_status: string; customer_id: string; job_id: string | null; quote_id: string | null;
  issue_date: string; due_date: string; customer_name: string; customer_email: string | null; billing_address: string | null;
  discount_cents: number; tax_rate: number; notes: string | null; terms: string | null; sent_at: string | null;
  lines: InvoiceLine[]; payments: Payment[]; totals: InvoiceTotals;
};

export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  const supabase = await createClient();
  const { data: i } = await supabase
    .from("invoices")
    .select("id,number,status,customer_id,job_id,quote_id,issue_date,due_date,customer_name,customer_email,billing_address,discount_cents,tax_rate,notes,terms,sent_at")
    .eq("id", id).maybeSingle();
  if (!i) return null;
  const [{ data: lines }, { data: payments }, { data: t }, { data: ov }] = await Promise.all([
    supabase.from("invoice_lines").select("id,description,quantity,unit_price_cents,position").eq("invoice_id", id).order("position"),
    supabase.from("payments").select("id,amount_cents,paid_on,method,reference,notes").eq("invoice_id", id).order("paid_on").order("created_at"),
    supabase.rpc("invoice_totals", { p_invoice: id }),
    supabase.from("invoices_overview").select("display_status").eq("id", id).single(),
  ]);
  const r = (t?.[0] ?? {}) as Record<string, unknown>;
  return {
    ...i, tax_rate: Number(i.tax_rate), display_status: ov?.display_status ?? i.status,
    lines: (lines ?? []).map((l) => ({ ...l, quantity: Number(l.quantity) })),
    payments: payments ?? [],
    totals: {
      subtotal_cents: Number(r.subtotal_cents ?? 0), discount_cents: Number(r.discount_cents ?? 0), tax_cents: Number(r.tax_cents ?? 0),
      total_cents: Number(r.total_cents ?? 0), paid_cents: Number(r.paid_cents ?? 0), balance_cents: Number(r.balance_cents ?? 0),
    },
  };
}

export async function invoiceForJob(jobId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("invoices").select("id").eq("job_id", jobId).neq("status", "void").limit(1);
  return data?.[0]?.id ?? null;
}
