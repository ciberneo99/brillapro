import "server-only";
import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZE = 50;

/** The company's shared categories (the same list as Bank Reports). "Income" is for deposits, so it is not offered for expenses. */
export type Category = { id: string; name: string; parent: string | null; label: string; is_active: boolean; sort_order: number };

const INCOME = new Set(["income", "ingresos"]);

export async function listCategories(opts: { activeOnly?: boolean } = {}): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("bank_categories").select("id,parent_id,name,is_active,sort_order").order("sort_order").order("name").limit(500);
  const rows = data ?? [];
  const byId = new Map(rows.map((c) => [c.id, c]));
  const out: Category[] = [];
  for (const c of rows) {
    const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
    const root = parent ?? c;
    if (INCOME.has(root.name.trim().toLowerCase())) continue;
    if (opts.activeOnly && (!c.is_active || (parent && !parent.is_active))) continue;
    out.push({ id: c.id, name: c.name, parent: parent?.name ?? null, label: parent ? `${parent.name}: ${c.name}` : c.name, is_active: c.is_active, sort_order: c.sort_order });
  }
  return out;
}

/** "Main: Sub" text for every category id, to show next to an expense. */
async function labelsById(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("bank_categories").select("id,parent_id,name").limit(500);
  const rows = data ?? [];
  const byId = new Map(rows.map((c) => [c.id, c]));
  return new Map(rows.map((c) => [c.id, c.parent_id && byId.get(c.parent_id) ? `${byId.get(c.parent_id)!.name}: ${c.name}` : c.name]));
}

export type ExpenseRow = {
  id: string; expense_date: string; vendor: string; description: string | null; amount_cents: number; category_id: string;
  categoryName: string; payment_method: string | null; receipt_path: string | null; job_id: string | null;
};

export async function listExpenses(params: { from: string; to: string; categoryIds?: string[]; page?: number }) {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(params.page ?? 1));
  let q = supabase
    .from("expenses")
    .select("id,expense_date,vendor,description,amount_cents,category_id,payment_method,receipt_path,job_id", { count: "exact" })
    .gte("expense_date", params.from).lte("expense_date", params.to);
  if (params.categoryIds?.length) q = q.in("category_id", params.categoryIds);
  const labels = await labelsById();
  const { data, count } = await q.order("expense_date", { ascending: false }).order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  return {
    rows: (data ?? []).map((r) => ({ ...r, categoryName: labels.get(r.category_id) ?? "" })) as ExpenseRow[],
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
    .select("id,expense_date,vendor,description,amount_cents,category_id,payment_method,receipt_path,job_id")
    .eq("id", id).maybeSingle();
  if (!data) return null;
  return { ...data, categoryName: (await labelsById()).get(data.category_id) ?? "" } as ExpenseRow;
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
