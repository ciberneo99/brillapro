"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addDays } from "@/lib/calendar";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { reportInPlan } from "@/modules/reports/catalog";
import { checkReceipt } from "@/modules/expenses/schema";
import { autoPairs } from "./match";

const HOME = "/expenses/bank";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back = (f: FormData, extra = "") => {
  const to = String(f.get("back") ?? "");
  const path = to.startsWith(HOME) && !to.startsWith("//") ? to : HOME;
  return extra ? `${path}${path.includes("?") ? "&" : "?"}${extra}` : path;
};

async function guard() {
  const ctx = await requireContext();
  if (!can(ctx.role, "bank:write") || !reportInPlan("bank_reports", ctx.planId)) redirect("/expenses");
  return ctx;
}
const refresh = () => { revalidatePath(HOME); revalidatePath("/expenses"); };

/** Attaches a receipt file (photo or PDF) to one bank line, replacing the previous one. */
export async function uploadTxReceipt(id: string, formData: FormData) {
  const ctx = await guard();
  const file = formData.get("receipt");
  if (!UUID.test(id) || !(file instanceof File) || file.size === 0) redirect(back(formData, "error=type"));
  const check = checkReceipt(file);
  if ("error" in check) redirect(back(formData, `error=${check.error}`));
  const supabase = await createClient();
  const { data: tx } = await supabase.from("bank_transactions").select("receipt_path").eq("id", id).maybeSingle();
  if (!tx) redirect(back(formData));
  const path = `${ctx.tenant.id}/bank/${id}/${randomUUID()}.${check.ext}`;
  const { error } = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type, upsert: false });
  if (error) redirect(back(formData, "error=upload"));
  const { error: linkError } = await supabase.from("bank_transactions").update({ receipt_path: path }).eq("id", id);
  if (linkError) { await supabase.storage.from("receipts").remove([path]); redirect(back(formData, "error=upload")); }
  if (tx.receipt_path) await supabase.storage.from("receipts").remove([tx.receipt_path]);
  refresh();
  redirect(back(formData, "saved=receipt"));
}

export async function removeTxReceipt(id: string, formData: FormData) {
  await guard();
  const supabase = await createClient();
  const { data: tx } = await supabase.from("bank_transactions").select("receipt_path").eq("id", id).maybeSingle();
  if (tx?.receipt_path) {
    await supabase.from("bank_transactions").update({ receipt_path: null }).eq("id", id);
    await supabase.storage.from("receipts").remove([tx.receipt_path]);
  }
  refresh();
  redirect(back(formData));
}

/** Joins a bank withdrawal with an expense that was entered from its receipt. */
export async function linkTxExpense(id: string, expenseId: string, formData: FormData) {
  await guard();
  if (!UUID.test(id) || !UUID.test(expenseId)) redirect(back(formData, "error=invalid"));
  const supabase = await createClient();
  const { error } = await supabase.from("bank_transactions").update({ expense_id: expenseId }).eq("id", id);
  refresh();
  redirect(back(formData, error ? "error=invalid" : "saved=linked"));
}

export async function unlinkTxExpense(id: string, formData: FormData) {
  await guard();
  const supabase = await createClient();
  await supabase.from("bank_transactions").update({ expense_id: null }).eq("id", id);
  refresh();
  redirect(back(formData));
}

/** Links every withdrawal of the month that has exactly one matching expense (same amount, nearby date). */
export async function autoMatchMonth(formData: FormData) {
  await guard();
  const month = String(formData.get("month") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) redirect(back(formData));
  const first = `${month}-01`;
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10);
  const last = addDays(next, -1);
  const supabase = await createClient();
  const [{ data: txs }, { data: exps }, { data: taken }] = await Promise.all([
    supabase.from("bank_transactions").select("id,tx_date,amount_cents").lt("amount_cents", 0).is("expense_id", null).gte("tx_date", first).lte("tx_date", last).limit(2000),
    supabase.from("expenses").select("id,expense_date,amount_cents").gte("expense_date", addDays(first, -7)).lte("expense_date", addDays(last, 7)).limit(3000),
    supabase.from("bank_transactions").select("expense_id").not("expense_id", "is", null).limit(5000),
  ]);
  const used = new Set((taken ?? []).map((r) => r.expense_id as string));
  const pairs = autoPairs((txs ?? []) as never, ((exps ?? []) as { id: string; expense_date: string; amount_cents: number }[]).filter((e) => !used.has(e.id)));
  let linked = 0;
  for (const p of pairs) {
    const { error } = await supabase.from("bank_transactions").update({ expense_id: p.expenseId }).eq("id", p.txId).is("expense_id", null);
    if (!error) linked++;
  }
  refresh();
  redirect(back(formData, `matched=${linked}`));
}
