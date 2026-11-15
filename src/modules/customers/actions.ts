"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { customerFormSchema, restoredStatus, type CustomerStatus } from "./schema";
import { getCustomer } from "./queries";
import { readCustomersCsv } from "./csv";

export type ImportSkip = { row: number; reason: "identityRequired" | "invalid" | "duplicate" | "limit" | "saveFailed"; fields?: string[] };
export type ImportResult =
  | { ok: true; imported: number; skipped: ImportSkip[]; skippedTotal: number }
  | { ok: false; error: "file" | "tooBig" | "empty" | "noHeaders" | "tooMany" | "notAllowed" };

const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export type CustomerFormState = { error?: "identityRequired" | "invalid" | "saveFailed" | "notAllowed" | "customerLimit"; fields?: string[] } | undefined;

function parse(formData: FormData) {
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string"));
  const parsed = customerFormSchema.safeParse(raw);
  if (parsed.success) return { data: parsed.data };
  const issue = parsed.error.issues.find((i) => i.message === "identityRequired");
  return {
    error: (issue ? "identityRequired" : "invalid") as "identityRequired" | "invalid",
    fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))],
  };
}

export async function createCustomer(_: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "customers:write")) return { error: "notAllowed" };
  const p = parse(formData);
  if (!p.data) return { error: p.error, fields: p.fields };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    // tenant_id and created_by come from the verified session, never from the form.
    .insert({ ...p.data, tenant_id: ctx.tenant.id, created_by: ctx.userId, status: "prospect", source: "manual" })
    .select("id")
    .single();
  if (error?.message.includes("limit")) return { error: "customerLimit" };
  if (error || !data) return { error: "saveFailed" };
  revalidatePath("/customers");
  redirect(`/customers/${data.id}`);
}

export async function updateCustomer(id: string, _: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "customers:write")) return { error: "notAllowed" };
  const p = parse(formData);
  if (!p.data) return { error: p.error, fields: p.fields };

  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").update(p.data).eq("id", id).select("id");
  if (error || !data?.length) return { error: "saveFailed" };
  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

/** Prospect → Active customer. Same record, history preserved (atomic DB function). */
export async function convertCustomer(id: string) {
  const ctx = await requireContext();
  if (!can(ctx.role, "customers:write")) redirect(`/customers/${id}`);
  const supabase = await createClient();
  await supabase.rpc("convert_customer", { p_id: id });
  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

/** archive | inactive | restore (restore/reactivate go back to what the record was before). */
export async function changeCustomerStatus(id: string, action: "archive" | "inactive" | "restore") {
  const ctx = await requireContext();
  if (!can(ctx.role, "customers:write")) redirect(`/customers/${id}`);
  const c = await getCustomer(id);
  if (!c) redirect("/customers");

  const next: CustomerStatus = action === "archive" ? "archived" : action === "inactive" ? "inactive" : restoredStatus(c);
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ status: next }).eq("id", id);
  revalidatePath("/customers");
  redirect(`/customers/${id}${error?.message.includes("limit") ? "?error=limit" : ""}`);
}

/** "Delete" from the customers list: archives the customer (history is kept) and returns to the same list with a confirmation. */
export async function removeCustomerFromList(id: string, back: string) {
  const ctx = await requireContext();
  const list = back.startsWith("/customers") && !back.startsWith("//") ? back.split("#")[0] : "/customers";
  const to = (q: string) => { const [path, qs = ""] = list.split("?"); const sp = new URLSearchParams(qs); sp.delete("removed"); sp.delete("removeError"); for (const [k, v] of new URLSearchParams(q)) sp.set(k, v); return `${path}?${sp.toString()}`; };
  if (!can(ctx.role, "customers:write")) redirect(to("removeError=1"));
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ status: "archived" }).eq("id", id);
  revalidatePath("/customers");
  redirect(to(error ? "removeError=1" : "removed=1"));
}

/** Adds customers from a CSV. Valid rows are saved, the rest are reported one by one; nothing is ever overwritten. */
export async function importCustomers(formData: FormData): Promise<ImportResult> {
  const ctx = await requireContext();
  if (!can(ctx.role, "customers:write")) return { ok: false, error: "notAllowed" };
  const f = formData.get("file");
  if (!(f instanceof File) || f.size === 0) return { ok: false, error: "file" };
  if (f.size > IMPORT_MAX_BYTES) return { ok: false, error: "tooBig" };
  if (!/\.csv$/i.test(f.name) && !/csv|text\/plain|excel/i.test(f.type)) return { ok: false, error: "file" };

  const read = readCustomersCsv(await f.text());
  if ("error" in read) return { ok: false, error: read.error };

  const skipped: ImportSkip[] = [];
  const valid: { line: number; data: NonNullable<ReturnType<typeof parse>["data"]>; status: "prospect" | "active" | "inactive" }[] = [];
  for (const row of read.rows) {
    const parsed = customerFormSchema.safeParse(row.values);
    if (!parsed.success) {
      const identity = parsed.error.issues.some((i) => i.message === "identityRequired");
      skipped.push(identity ? { row: row.line, reason: "identityRequired" } : { row: row.line, reason: "invalid", fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] });
      continue;
    }
    valid.push({ line: row.line, data: parsed.data, status: row.status ?? "active" });
  }

  const supabase = await createClient();

  // Skip e-mails that already belong to a customer, or that repeat earlier in the same file.
  const emails = [...new Set(valid.map((v) => v.data.email).filter((e): e is string => !!e))];
  const existing = new Set<string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await supabase.from("customers").select("email").in("email", emails.slice(i, i + 200)).neq("status", "archived");
    for (const r of data ?? []) if (r.email) existing.add(String(r.email).toLowerCase());
  }
  const seen = new Set<string>();
  const fresh = valid.filter((v) => {
    const e = v.data.email;
    if (!e) return true;
    if (existing.has(e) || seen.has(e)) { skipped.push({ row: v.line, reason: "duplicate" }); return false; }
    seen.add(e);
    return true;
  });

  const now = new Date().toISOString();
  // tenant_id and created_by come from the verified session, never from the file.
  const toRow = (v: (typeof fresh)[number]) => ({ ...v.data, tenant_id: ctx.tenant.id, created_by: ctx.userId, status: v.status, source: "manual", converted_at: v.status === "prospect" ? null : now });

  let imported = 0;
  for (let i = 0; i < fresh.length; i += 100) {
    const chunk = fresh.slice(i, i + 100);
    const { error } = await supabase.from("customers").insert(chunk.map(toRow));
    if (!error) { imported += chunk.length; continue; }
    // The plan limit (or one bad row) rejects the whole chunk: retry row by row to save what fits.
    for (const v of chunk) {
      const res = await supabase.from("customers").insert(toRow(v));
      if (!res.error) imported++;
      else skipped.push({ row: v.line, reason: res.error.message.includes("limit") ? "limit" : "saveFailed" });
    }
  }

  revalidatePath("/customers");
  skipped.sort((a, b) => a.row - b.row);
  return { ok: true, imported, skipped: skipped.slice(0, 200), skippedTotal: skipped.length };
}
