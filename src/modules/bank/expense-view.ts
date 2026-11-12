import "server-only";
import { addDays } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import { candidatesFor, MATCH_DAYS, type MatchExpense } from "./match";

export type WithdrawalRow = {
  id: string; tx_date: string; description: string; amount_cents: number; category_id: string | null; notes: string | null;
  receiptUrl: string | null; hasReceipt: boolean;
  linked: { id: string; vendor: string; expense_date: string; amount_cents: number } | null;
  suggestion: { id: string; vendor: string; expense_date: string } | null;
};

/** The month's bank withdrawals with their receipt link, the expense they are matched with, or the expense that looks like theirs. */
export async function monthWithdrawals(month: string, onlyMissing: boolean) {
  const supabase = await createClient();
  const first = `${month}-01`;
  const last = addDays(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10), -1);
  const { data } = await supabase
    .from("bank_transactions").select("id,tx_date,description,amount_cents,category_id,notes,receipt_path,expense_id")
    .lt("amount_cents", 0).gte("tx_date", first).lte("tx_date", last)
    .order("tx_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  const txs = data ?? [];

  const { data: near } = await supabase
    .from("expenses").select("id,vendor,description,expense_date,amount_cents")
    .gte("expense_date", addDays(first, -MATCH_DAYS)).lte("expense_date", addDays(last, MATCH_DAYS)).limit(3000);
  const { data: taken } = await supabase.from("bank_transactions").select("expense_id").not("expense_id", "is", null).limit(5000);
  const used = new Set((taken ?? []).map((r) => r.expense_id as string));
  const free = (near ?? []).filter((e) => !used.has(e.id));
  const byId = new Map<string, { id: string; vendor: string; description: string | null; expense_date: string; amount_cents: number }>((near ?? []).map((e) => [e.id, e]));

  const missing = [...new Set(txs.map((t) => t.expense_id).filter((id): id is string => !!id && !byId.has(id)))];
  if (missing.length) {
    const { data: more } = await supabase.from("expenses").select("id,vendor,description,expense_date,amount_cents").in("id", missing);
    for (const e of more ?? []) byId.set(e.id, e);
  }

  const paths = txs.map((t) => t.receipt_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("receipts").createSignedUrls(paths, 600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const name = (e: { vendor: string; description: string | null }) => e.vendor || e.description || "—";
  const rows: WithdrawalRow[] = txs.map((t) => {
    const linked = t.expense_id ? byId.get(t.expense_id) : undefined;
    const pick = !linked ? candidatesFor(t, free as MatchExpense[])[0] : undefined;
    const sug = pick ? byId.get(pick.id) : undefined;
    return {
      id: t.id, tx_date: t.tx_date, description: t.description, amount_cents: t.amount_cents, category_id: t.category_id, notes: t.notes,
      receiptUrl: t.receipt_path ? urls.get(t.receipt_path) ?? null : null, hasReceipt: !!t.receipt_path,
      linked: linked ? { id: linked.id, vendor: name(linked), expense_date: linked.expense_date, amount_cents: linked.amount_cents } : null,
      suggestion: sug ? { id: sug.id, vendor: name(sug), expense_date: sug.expense_date } : null,
    };
  });
  const shown = onlyMissing ? rows.filter((r) => !r.hasReceipt && !r.linked) : rows;
  return {
    rows: shown,
    stats: {
      count: rows.length,
      total: rows.reduce((s, r) => s - r.amount_cents, 0),
      withReceipt: rows.filter((r) => r.hasReceipt || r.linked).length,
      suggested: rows.filter((r) => r.suggestion).length,
    },
  };
}
