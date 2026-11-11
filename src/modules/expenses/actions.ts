"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { todayIso } from "@/lib/calendar";
import { listCategories } from "./queries";
import { readReceipt } from "./receipt-ai";
import { checkReceipt, expenseSchema } from "./schema";

const raw = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"));
const page = (id: string, q = "") => `/expenses/${id}${q}`;

async function guard() {
  const ctx = await requireContext();
  if (!can(ctx.role, "expenses:write")) redirect("/expenses");
  return ctx;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Uploads a receipt to the private bucket under <company>/<expense>/ and links it. Returns an error code or null. */
async function storeReceipt(supabase: Supabase, tenantId: string, expenseId: string, file: File, previous?: string | null) {
  const check = checkReceipt(file);
  if ("error" in check) return check.error;
  const path = `${tenantId}/${expenseId}/${randomUUID()}.${check.ext}`;
  const { error } = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return "upload";
  const { error: linkError } = await supabase.from("expenses").update({ receipt_path: path }).eq("id", expenseId);
  if (linkError) {
    await supabase.storage.from("receipts").remove([path]);
    return "upload";
  }
  if (previous) await supabase.storage.from("receipts").remove([previous]);
  return null;
}

const fileFrom = (formData: FormData): File | null => {
  const f = formData.get("receipt");
  return f instanceof File && f.size > 0 ? f : null;
};

export async function createExpense(formData: FormData) {
  const ctx = await guard();
  const p = expenseSchema.safeParse(raw(formData));
  if (!p.success) redirect("/expenses/new?error=invalid");
  const file = fileFrom(formData);
  if (file) {
    const c = checkReceipt(file);
    if ("error" in c) redirect(`/expenses/new?error=${c.error}`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses").insert({ ...p.data, tenant_id: ctx.tenant.id, created_by: ctx.userId }).select("id").single();
  if (error || !data) redirect("/expenses/new?error=invalid");
  const problem = file ? await storeReceipt(supabase, ctx.tenant.id, data.id, file) : null;
  revalidatePath("/expenses");
  redirect(page(data.id, problem ? "?error=upload" : "?saved=1"));
}

export async function updateExpense(id: string, formData: FormData) {
  await guard();
  const p = expenseSchema.safeParse(raw(formData));
  if (!p.success) redirect(page(id, "?error=invalid"));
  const supabase = await createClient();
  const { data, error } = await supabase.from("expenses").update(p.data).eq("id", id).select("id");
  revalidatePath("/expenses");
  redirect(page(id, error || !data?.length ? "?error=invalid" : "?saved=1"));
}

export async function uploadReceipt(id: string, formData: FormData) {
  const ctx = await guard();
  const file = fileFrom(formData);
  if (!file) redirect(page(id, "?error=type"));
  const supabase = await createClient();
  const { data: e } = await supabase.from("expenses").select("receipt_path").eq("id", id).maybeSingle();
  if (!e) redirect("/expenses");
  const problem = await storeReceipt(supabase, ctx.tenant.id, id, file, e.receipt_path);
  revalidatePath(page(id));
  redirect(page(id, problem ? `?error=${problem}` : "?saved=1"));
}

export async function removeReceipt(id: string) {
  await guard();
  const supabase = await createClient();
  const { data: e } = await supabase.from("expenses").select("receipt_path").eq("id", id).maybeSingle();
  if (e?.receipt_path) {
    await supabase.from("expenses").update({ receipt_path: null }).eq("id", id);
    await supabase.storage.from("receipts").remove([e.receipt_path]);
  }
  revalidatePath(page(id));
  redirect(page(id));
}

/** Owner / admin only (matches the database policy). The receipt file goes with it. */
export async function deleteExpense(id: string) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect(page(id));
  const supabase = await createClient();
  const { data: e } = await supabase.from("expenses").select("receipt_path").eq("id", id).maybeSingle();
  const { data: gone } = await supabase.from("expenses").delete().eq("id", id).select("id");
  if (gone?.length && e?.receipt_path) await supabase.storage.from("receipts").remove([e.receipt_path]);
  revalidatePath("/expenses");
  redirect("/expenses");
}

// ───────── AI receipt reading (suggestions only; nothing is saved) ─────────
export type ScanResult =
  | { ok: true; suggestion: import("./receipt-reading").ReceiptSuggestion }
  | { ok: false; error: "denied" | "type" | "size" | "disabled" | "failed" };

export async function scanReceipt(formData: FormData): Promise<ScanResult> {
  const ctx = await requireContext();
  if (!can(ctx.role, "expenses:write")) return { ok: false, error: "denied" };
  const f = formData.get("receipt");
  if (!(f instanceof File) || f.size === 0) return { ok: false, error: "type" };
  const check = checkReceipt(f);
  if ("error" in check) return { ok: false, error: check.error };
  const categories = (await listCategories({ activeOnly: true })).map((c) => ({ id: c.id, name: c.label }));
  const today = todayIso(ctx.settings.timezone);
  return readReceipt({ base64: Buffer.from(await f.arrayBuffer()).toString("base64"), mediaType: f.type }, categories, today);
}
