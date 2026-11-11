import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CustomerExtras = {
  outstanding_cents: number; overdue_cents: number;
  job_id: string | null; job_title: string | null; job_date: string | null; job_status: string | null;
  planned_minutes: number | null; actual_minutes: number | null; crew: number | null;
};
export type CustomersSummary = { overdue_cents: number; outstanding_cents: number; draft_quotes: number };

type ExtrasRow = CustomerExtras & { customer_id: string };

/** Money and hours per customer for the ids on the current page. Roles without access get zeros/nulls via RLS. */
export async function getCustomerExtras(ids: string[]): Promise<Map<string, CustomerExtras>> {
  const map = new Map<string, CustomerExtras>();
  if (ids.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase.rpc("customer_list_extras", { p_ids: ids });
  for (const r of (data ?? []) as ExtrasRow[]) {
    map.set(r.customer_id, {
      outstanding_cents: Number(r.outstanding_cents), overdue_cents: Number(r.overdue_cents),
      job_id: r.job_id, job_title: r.job_title, job_date: r.job_date, job_status: r.job_status,
      planned_minutes: r.planned_minutes, actual_minutes: r.actual_minutes, crew: r.crew,
    });
  }
  return map;
}

export async function getCustomersSummary(): Promise<CustomersSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("customers_summary");
  const r = Array.isArray(data) ? data[0] : null;
  return r ? { overdue_cents: Number(r.overdue_cents), outstanding_cents: Number(r.outstanding_cents), draft_quotes: Number(r.draft_quotes) } : null;
}

/** 95 → "1h 35m", 60 → "1h", 20 → "20m". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** Money received from this customer since Jan 1 of `year` (payments on their non-void invoices). Zero for roles that can't see payments. */
export async function getCustomerYtdCents(customerId: string, year: string): Promise<number> {
  const supabase = await createClient();
  const { data: invs } = await supabase.from("invoices").select("id").eq("customer_id", customerId).neq("status", "void").limit(2000);
  const ids = (invs ?? []).map((i) => i.id);
  if (ids.length === 0) return 0;
  const { data } = await supabase.from("payments").select("amount_cents").in("invoice_id", ids).gte("paid_on", `${year}-01-01`).lte("paid_on", `${year}-12-31`);
  return (data ?? []).reduce((a, p) => a + Number(p.amount_cents), 0);
}
