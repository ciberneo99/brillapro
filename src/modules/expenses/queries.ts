import "server-only";
import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZE = 50;

export type Category = { id: string; name: string; is_active: boolean; sort_order: number };

export async function listCategories(opts: { activeOnly?: boolean } = {}): Promise<Category[]> {
  const supabase = await createClient();
  let q = supabase.from("expense_categories").select("id,name,is_active,sort_order").order("sort_order").order("name");
  if (opts.activeOnly) q = q.eq("is_active", true);
  const { data } = await q;
  return data ?? [];
}

export type ExpenseRow = {
  id: string; expense_date: string; vendor: string; description: string | null; amount_cents: number; category_id: string;
  categoryName: string; payment_method: string | null; receipt_path: string | null; job_id: string | null;
};

export async function listExpenses(params: { from: string; to: string; categoryId?: string; page?: number }) {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(params.page ?? 1));
  let q = supabase
    .from("expenses")
    .select("id,expense_date,vendor,description,amount_cents,category_id,payment_method,receipt_path,job_id,expense_categories(name)", { count: "exact" })
    .gte("expense_date", params.from).lte("expense_date", params.to);
  if (params.categoryId) q = q.eq("category_id", params.categoryId);
  const { data, count } = await q.order("expense_date", { ascending: false }).order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  return {
    rows: (data ?? []).map((r) => ({ ...r, categoryName: (r.expense_categories as unknown as { name: string } | null)?.name ?? "" })) as ExpenseRow[],
    total: count ?? 0, page,
  };
}

export async function expenseSummary(from: string, to: string): Promise<{ category_id: string; name: string; total: number; entries: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("expense_summary", { p_from: from, p_to: to });
  return (data ?? []).map((r: Record<string, unknown>) => ({
    category_id: r.category_id as string, name: r.category_name as string, total: Number(r.total_cents), entries: Number(r.entries),
  }));
}

export async function getExpense(id: string): Promise<ExpenseRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("expenses")
    .select("id,expense_date,vendor,description,amount_cents,category_id,payment_method,receipt_path,job_id,expense_categories(name)")
    .eq("id", id).maybeSingle();
  if (!data) return null;
  return { ...data, categoryName: (data.expense_categories as unknown as { name: string } | null)?.name ?? "" } as ExpenseRow;
}

/** Short-lived link to view a private receipt (checked against the company by Storage policies). */
export async function receiptUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

/** Latest jobs, to optionally tie an expense to one. */
export async function recentJobs() {
  const supabase = await createClient();
  const { data } = await supabase.from("jobs").select("id,title,customer_name,scheduled_date").order("scheduled_date", { ascending: false }).limit(100);
  return data ?? [];
}
