"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { customerFormSchema, restoredStatus, type CustomerStatus } from "./schema";
import { getCustomer } from "./queries";

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
