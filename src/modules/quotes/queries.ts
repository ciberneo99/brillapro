import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { QuoteTotals } from "./schema";

export const PAGE_SIZE = 25;
const FILTERS = ["draft", "sent", "accepted", "declined", "expired"] as const;

export type QuoteSettings = { quote_prefix: string; quote_valid_days: number; default_tax_rate: number; quote_terms: string | null };

export async function getQuoteSettings(tenantId: string): Promise<QuoteSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_settings").select("quote_prefix,quote_valid_days,default_tax_rate,quote_terms").eq("tenant_id", tenantId).single();
  return {
    quote_prefix: data?.quote_prefix ?? "Q-", quote_valid_days: data?.quote_valid_days ?? 30,
    default_tax_rate: Number(data?.default_tax_rate ?? 0), quote_terms: data?.quote_terms ?? null,
  };
}

export type QuoteListRow = {
  id: string; number: number; status: string; display_status: string; title: string | null; expires_on: string;
  customer_id: string; first_name: string; last_name: string; company_name: string; total_cents: number | null;
};

export async function listQuotes(params: { status?: string; customerId?: string; page?: number }) {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(params.page ?? 1));
  let q = supabase
    .from("quotes_overview")
    .select("id,number,status,display_status,title,expires_on,customer_id,first_name,last_name,company_name,total_cents", { count: "exact" });
  if (params.status && (FILTERS as readonly string[]).includes(params.status)) q = q.eq("display_status", params.status);
  if (params.customerId) q = q.eq("customer_id", params.customerId);
  const { data, count } = await q
    .order("number", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  return { rows: (data ?? []) as QuoteListRow[], total: count ?? 0, page };
}

export type QuoteOption = { id: string; name: string; description: string | null; base_price_cents: number; position: number };
export type QuoteLine = { id: string; description: string; quantity: number; unit_price_cents: number; position: number };
export type QuoteDetail = {
  id: string; number: number; status: string; display_status: string; customer_id: string; service_type_id: string | null;
  title: string | null; issue_date: string; expires_on: string; discount_cents: number; tax_rate: number;
  selected_option_id: string | null; notes: string | null; terms: string | null; sent_at: string | null; responded_at: string | null;
  customer: { first_name: string; last_name: string; company_name: string; email: string | null; phone: string | null;
    service_address: string | null; city: string | null; state: string | null; zip_code: string | null };
  serviceName: string | null;
  options: QuoteOption[]; lines: QuoteLine[]; totals: QuoteTotals[];
};

export async function getQuote(id: string): Promise<QuoteDetail | null> {
  const supabase = await createClient();
  const { data: q } = await supabase
    .from("quotes")
    .select("id,number,status,customer_id,service_type_id,title,issue_date,expires_on,discount_cents,tax_rate,selected_option_id,notes,terms,sent_at,responded_at")
    .eq("id", id).maybeSingle();
  if (!q) return null;
  const [{ data: c }, { data: options }, { data: lines }, { data: totals }, svc] = await Promise.all([
    supabase.from("customers").select("first_name,last_name,company_name,email,phone,service_address,city,state,zip_code").eq("id", q.customer_id).single(),
    supabase.from("quote_options").select("id,name,description,base_price_cents,position").eq("quote_id", id).order("position"),
    supabase.from("quote_lines").select("id,description,quantity,unit_price_cents,position").eq("quote_id", id).order("position"),
    supabase.rpc("quote_totals", { p_quote: id }),
    q.service_type_id ? supabase.from("service_types").select("name").eq("id", q.service_type_id).single() : Promise.resolve({ data: null }),
  ]);
  const expired = (q.status === "draft" || q.status === "sent") && q.expires_on < new Date().toISOString().slice(0, 10);
  return {
    ...q, tax_rate: Number(q.tax_rate), display_status: expired ? "expired" : q.status,
    customer: c ?? { first_name: "", last_name: "", company_name: "", email: null, phone: null, service_address: null, city: null, state: null, zip_code: null },
    serviceName: svc.data?.name ?? null,
    options: options ?? [],
    lines: (lines ?? []).map((l) => ({ ...l, quantity: Number(l.quantity) })),
    totals: (totals ?? []).map((t: Record<string, unknown>) => ({
      option_id: (t.option_id as string | null) ?? null, subtotal_cents: Number(t.subtotal_cents), discount_cents: Number(t.discount_cents),
      tax_cents: Number(t.tax_cents), total_cents: Number(t.total_cents),
    })),
  };
}
