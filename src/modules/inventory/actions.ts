"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { itemSchema, movementSchema } from "./schema";

const raw = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"));

async function guard() {
  const ctx = await requireContext();
  if (!can(ctx.role, "inventory:write")) redirect("/inventory");
  return ctx;
}

export async function createItem(formData: FormData) {
  const ctx = await guard();
  const p = itemSchema.safeParse(raw(formData));
  if (!p.success) redirect("/inventory/new?error=invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.from("inventory_items").insert({ ...p.data, tenant_id: ctx.tenant.id }).select("id").single();
  if (error || !data) redirect(`/inventory/new?error=${error?.code === "23505" ? "taken" : "invalid"}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${data.id}?saved=1`);
}

export async function updateItem(id: string, formData: FormData) {
  await guard();
  const p = itemSchema.safeParse(raw(formData));
  if (!p.success) redirect(`/inventory/${id}?error=invalid`);
  const supabase = await createClient();
  const { data, error } = await supabase.from("inventory_items").update(p.data).eq("id", id).select("id");
  revalidatePath("/inventory");
  redirect(`/inventory/${id}${error || !data?.length ? `?error=${error?.code === "23505" ? "taken" : "invalid"}` : "?saved=1"}`);
}

export async function setItemActive(id: string, active: boolean) {
  await guard();
  const supabase = await createClient();
  await supabase.from("inventory_items").update({ is_active: active }).eq("id", id);
  revalidatePath("/inventory");
  redirect(`/inventory/${id}`);
}

export async function addMovement(id: string, formData: FormData) {
  const ctx = await guard();
  const p = movementSchema.safeParse(raw(formData));
  if (!p.success) redirect(`/inventory/${id}?error=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.from("inventory_movements").insert({ ...p.data, tenant_id: ctx.tenant.id, item_id: id, created_by: ctx.userId });
  revalidatePath("/inventory");
  redirect(`/inventory/${id}${error ? `?error=${error.code === "23514" ? "stock" : "invalid"}` : "?saved=1"}`);
}
