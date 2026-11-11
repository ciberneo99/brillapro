"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import { todayIso } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { getAppContext, requireContext } from "@/lib/session";
import { dedupeInput, parseStatement, suggestCategory, type ParsedTx, type StatementSummary } from "./parse";
import { categorySchema, editSchema, importSchema, MAX_PDF_BYTES, toCents } from "./schema";

const BASE = "/reports/bank";
const raw = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"));
const key = (t: ParsedTx, n: number) => createHash("sha1").update(dedupeInput(t, n)).digest("hex");
/** Only ever go back to a page inside the bank reports. */
const back = (f: FormData, extra = "") => {
  const to = String(f.get("back") ?? "");
  const path = to.startsWith(BASE) && !to.startsWith("//") ? to : BASE;
  return extra ? `${path}${path.includes("?") ? "&" : "?"}${extra}` : path;
};

async function guard() {
  const ctx = await requireContext();
  if (!can(ctx.role, "bank:write")) redirect("/reports");
  return ctx;
}

export type PreviewRow = ParsedTx & { n: number; categoryId: string | null; duplicate: boolean };
export type PreviewResult = { ok: true; fileName: string; rows: PreviewRow[]; summary: StatementSummary } | { ok: false; error: "file" | "type" | "tooBig" | "unreadable" | "empty" | "denied" };

/** Reads a bank statement PDF and returns the transactions found, for review. Nothing is saved yet. */
export async function previewStatement(formData: FormData): Promise<PreviewResult> {
  const ctx = await getAppContext();
  if (!ctx || !can(ctx.role, "bank:write")) return { ok: false, error: "denied" };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "file" };
  if (file.size > MAX_PDF_BYTES) return { ok: false, error: "tooBig" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") return { ok: false, error: "type" };

  let text: string;
  try {
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > 120) return { ok: false, error: "tooBig" };
    text = (await extractText(pdf, { mergePages: false })).text.join("\n");
  } catch {
    return { ok: false, error: "unreadable" };
  }
  const { transactions, summary: found } = parseStatement(text, Number(todayIso(ctx.settings.timezone).slice(0, 4)));
  if (!transactions.length) return { ok: false, error: "empty" };

  const supabase = await createClient();
  const { data: cats } = await supabase.from("bank_categories").select("id,keywords,parent_id").eq("is_active", true);
  const leaves = (cats ?? []).filter((c) => c.keywords.trim());
  const seen = new Map<string, number>();
  const rows = transactions.map((t) => {
    const base = dedupeInput(t, 0);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...t, n, categoryId: suggestCategory(t.description, leaves), duplicate: false };
  });
  const keys = rows.map((r) => key(r, r.n));
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await supabase.from("bank_transactions").select("dedupe_key").in("dedupe_key", keys.slice(i, i + 200));
    for (const r of data ?? []) existing.add(r.dedupe_key);
  }
  // Fill in what the statement did not print: the period from the dates, and either balance from the other one.
  const dates = transactions.map((t) => t.date).sort();
  const net = transactions.reduce((a, t) => a + t.amountCents, 0);
  const summary: StatementSummary = {
    ...found, periodStart: found.periodStart ?? dates[0], periodEnd: found.periodEnd ?? dates[dates.length - 1],
    beginningCents: found.beginningCents ?? (found.endingCents !== null ? found.endingCents - net : null),
    endingCents: found.endingCents ?? (found.beginningCents !== null ? found.beginningCents + net : null),
  };
  return { ok: true, fileName: file.name.slice(0, 200), rows: rows.map((r, i) => ({ ...r, duplicate: existing.has(keys[i]) })), summary };
}

export type ImportResult = { ok: true; added: number; skipped: number } | { ok: false; error: "invalid" | "denied" | "failed" };

/** Saves the reviewed rows. Rows already imported before are skipped, so a statement can be imported again safely. */
export async function importTransactions(payload: unknown): Promise<ImportResult> {
  const ctx = await getAppContext();
  if (!ctx || !can(ctx.role, "bank:write")) return { ok: false, error: "denied" };
  const p = importSchema.safeParse(payload);
  if (!p.success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const records = p.data.rows.map((r) => ({
    tenant_id: ctx.tenant.id, tx_date: r.date, description: r.description, amount_cents: r.amountCents, balance_cents: r.balanceCents,
    category_id: r.categoryId, source: p.data.source || null, dedupe_key: key({ date: r.date, description: r.description, amountCents: r.amountCents, balanceCents: r.balanceCents }, r.n), created_by: ctx.userId,
  }));
  let added = 0;
  for (let i = 0; i < records.length; i += 200) {
    const { data, error } = await supabase.from("bank_transactions").upsert(records.slice(i, i + 200), { onConflict: "tenant_id,dedupe_key", ignoreDuplicates: true }).select("id");
    if (error) return { ok: false, error: "failed" };
    added += data?.length ?? 0;
  }
  const st = p.data.statement;
  if (st) {
    // One statement per period: importing it again with corrected balances updates the figures.
    await supabase.from("bank_statements").upsert(
      { tenant_id: ctx.tenant.id, period_start: st.periodStart, period_end: st.periodEnd, beginning_balance_cents: st.beginningCents, ending_balance_cents: st.endingCents, source: p.data.source || null, created_by: ctx.userId },
      { onConflict: "tenant_id,period_start,period_end" },
    );
  }
  revalidatePath(BASE);
  return { ok: true, added, skipped: records.length - added };
}

export async function updateTransaction(id: string, formData: FormData) {
  await guard();
  const f = raw(formData);
  const p = editSchema.safeParse({ tx_date: f.tx_date, description: f.description, category_id: f.category_id || null, type: f.type, notes: f.notes ?? "" });
  const cents = toCents(String(f.amount ?? ""));
  if (!p.success || cents === null || cents === 0 || cents >= 100_000_000_000) redirect(back(formData, "error=invalid"));
  // Income is money in (positive), expense is money out (negative): this is what moves the amount between the columns.
  const { type, notes, ...rest } = p.data;
  const supabase = await createClient();
  const { error } = await supabase.from("bank_transactions").update({ ...rest, notes: notes || null, amount_cents: type === "in" ? cents : -cents }).eq("id", id);
  revalidatePath(BASE);
  redirect(back(formData, error ? "error=invalid" : "saved=1"));
}

export async function deleteTransaction(id: string, formData: FormData) {
  await guard();
  const supabase = await createClient();
  await supabase.from("bank_transactions").delete().eq("id", id);
  revalidatePath(BASE);
  redirect(back(formData));
}

const ids = (f: FormData) => f.getAll("ids").filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)).slice(0, 500);

export async function bulkCategorize(formData: FormData) {
  await guard();
  const list = ids(formData);
  const cat = String(formData.get("bulk_category") ?? "");
  if (!list.length || (cat !== "none" && !/^[0-9a-f-]{36}$/i.test(cat))) redirect(back(formData, "error=select"));
  const supabase = await createClient();
  const { error } = await supabase.from("bank_transactions").update({ category_id: cat === "none" ? null : cat }).in("id", list);
  revalidatePath(BASE);
  redirect(back(formData, error ? "error=invalid" : "saved=1"));
}

/** The default button of the table form: pressing Enter in a field must never delete anything. */
export async function refreshBank(formData: FormData) {
  await guard();
  redirect(back(formData));
}

export async function bulkDelete(formData: FormData) {
  await guard();
  const list = ids(formData);
  if (!list.length) redirect(back(formData, "error=select"));
  const supabase = await createClient();
  await supabase.from("bank_transactions").delete().in("id", list);
  revalidatePath(BASE);
  redirect(back(formData));
}

const CATS = `${BASE}?tab=categories`;

export async function addBankCategory(formData: FormData) {
  const ctx = await guard();
  const f = raw(formData);
  const p = categorySchema.safeParse({ name: f.name, keywords: f.keywords ?? "", parentId: f.parent_id || null });
  if (!p.success) redirect(`${CATS}&error=invalid`);
  const supabase = await createClient();
  const { data: last } = await supabase.from("bank_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("bank_categories").insert({
    tenant_id: ctx.tenant.id, name: p.data.name, keywords: p.data.keywords, parent_id: p.data.parentId, sort_order: (last?.sort_order ?? 0) + 10,
  });
  revalidatePath(BASE);
  redirect(error ? `${CATS}&error=${error.code === "23505" ? "duplicate" : "invalid"}` : `${CATS}&saved=1`);
}

export async function updateBankCategory(id: string, formData: FormData) {
  await guard();
  const f = raw(formData);
  const p = categorySchema.pick({ name: true, keywords: true }).safeParse({ name: f.name, keywords: f.keywords ?? "" });
  if (!p.success) redirect(`${CATS}&error=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.from("bank_categories").update(p.data).eq("id", id);
  revalidatePath(BASE);
  redirect(error ? `${CATS}&error=${error.code === "23505" ? "duplicate" : "invalid"}` : `${CATS}&saved=1`);
}

/** Categories are never deleted (past transactions keep them); they are hidden from new choices instead. */
export async function toggleBankCategory(id: string, active: boolean) {
  await guard();
  const supabase = await createClient();
  await supabase.from("bank_categories").update({ is_active: active }).eq("id", id);
  revalidatePath(BASE);
  redirect(CATS);
}
