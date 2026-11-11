import "server-only";
import { createClient } from "@/lib/supabase/server";

export const BANK_PAGE_SIZE = 50;

export type BankCategory = { id: string; parent_id: string | null; name: string; keywords: string; sort_order: number; is_active: boolean };

/** Makes sure the company has its starter categories (first visit only), then returns all of them. */
export async function listBankCategories(tenantId: string, locale: string): Promise<BankCategory[]> {
  const supabase = await createClient();
  const read = (max: number) => supabase.from("bank_categories").select("id,parent_id,name,keywords,sort_order,is_active").order("sort_order").order("name").limit(max);
  let { data } = await read(500);
  if (!data?.length) {
    await supabase.rpc("ensure_bank_categories", { p_tenant: tenantId, p_locale: locale });
    // A different limit makes this a new request: Next.js would otherwise reuse the (empty) first answer within this render.
    ({ data } = await read(501));
  }
  return (data ?? []) as BankCategory[];
}

/** "Parent › Child" labels for every category, so a pill can say where a subcategory lives. */
export function categoryLabels(cats: BankCategory[]): Map<string, { label: string; parent: string | null; tone: number }> {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const roots = cats.filter((c) => !c.parent_id);
  return new Map(cats.map((c) => {
    const parent = c.parent_id ? byId.get(c.parent_id) : null;
    const root = parent ?? c;
    return [c.id, { label: c.name, parent: parent?.name ?? null, tone: Math.max(0, roots.findIndex((r) => r.id === root.id)) }];
  }));
}

export type TxFilters = { q?: string; type?: "in" | "out"; category?: string; month?: string; sort?: "asc" | "desc"; page?: number };
export type TxRow = { id: string; tx_date: string; description: string; amount_cents: number; balance_cents: number | null; category_id: string | null };

const clean = (s: string) => s.replace(/[%,()]/g, " ").trim();

export async function listTransactions(f: TxFilters, categoryIds?: string[]) {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(f.page ?? 1));
  let q = supabase.from("bank_transactions").select("id,tx_date,description,amount_cents,balance_cents,category_id", { count: "exact" });
  if (f.q && clean(f.q)) q = q.ilike("description", `%${clean(f.q)}%`);
  if (f.type === "in") q = q.gt("amount_cents", 0);
  if (f.type === "out") q = q.lt("amount_cents", 0);
  if (f.category === "none") q = q.is("category_id", null);
  else if (categoryIds?.length) q = q.in("category_id", categoryIds);
  if (f.month && /^\d{4}-\d{2}$/.test(f.month)) {
    const [y, m] = f.month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 0)).getUTCDate();
    q = q.gte("tx_date", `${f.month}-01`).lte("tx_date", `${f.month}-${String(end).padStart(2, "0")}`);
  }
  const asc = f.sort === "asc";
  const { data, count } = await q.order("tx_date", { ascending: asc }).order("created_at", { ascending: asc }).range((page - 1) * BANK_PAGE_SIZE, page * BANK_PAGE_SIZE - 1);
  return { rows: (data ?? []) as TxRow[], total: count ?? 0, page };
}

/** Distinct months that have transactions (newest first), for the month filter. */
export async function listBankMonths(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("bank_transactions").select("tx_date").order("tx_date", { ascending: false }).limit(5000);
  return [...new Set((data ?? []).map((r) => r.tx_date.slice(0, 7)))];
}

/** Totals for the filtered list (deposits, withdrawals), pulled in pages so they stay exact. */
export async function sumTransactions(f: TxFilters, categoryIds?: string[]) {
  const supabase = await createClient();
  let deposits = 0, withdrawals = 0;
  for (let from = 0; from < 20000; from += 1000) {
    let q = supabase.from("bank_transactions").select("amount_cents");
    if (f.q && clean(f.q)) q = q.ilike("description", `%${clean(f.q)}%`);
    if (f.type === "in") q = q.gt("amount_cents", 0);
    if (f.type === "out") q = q.lt("amount_cents", 0);
    if (f.category === "none") q = q.is("category_id", null);
    else if (categoryIds?.length) q = q.in("category_id", categoryIds);
    if (f.month && /^\d{4}-\d{2}$/.test(f.month)) {
      const [y, m] = f.month.split("-").map(Number);
      q = q.gte("tx_date", `${f.month}-01`).lte("tx_date", `${f.month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`);
    }
    const { data } = await q.order("id").range(from, from + 999);
    for (const r of data ?? []) {
      if (r.amount_cents > 0) deposits += r.amount_cents;
      else withdrawals -= r.amount_cents;
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return { deposits, withdrawals };
}
