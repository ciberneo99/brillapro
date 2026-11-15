"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";

const BASE = "/settings/payment-methods";
const nameSchema = z.string().trim().min(1).max(60);

async function guard() {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect("/dashboard");
  return ctx;
}
const done = (q: string): never => { revalidatePath("/", "layout"); redirect(`${BASE}?${q}`); };
const failure = (code: string | undefined) => done(`error=${code === "23505" ? "duplicate" : "invalid"}`);

export async function addPaymentMethod(formData: FormData) {
  const ctx = await guard();
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return failure(undefined);
  const supabase = await createClient();
  const { data: last } = await supabase.from("payment_methods").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("payment_methods").insert({
    tenant_id: ctx.tenant.id, code: `m_${randomUUID().replace(/-/g, "").slice(0, 10)}`, name: name.data, sort_order: (last?.sort_order ?? 0) + 10,
  });
  return error ? failure(error.code) : done("saved=1");
}

export async function renamePaymentMethod(id: string, formData: FormData) {
  await guard();
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return failure(undefined);
  const supabase = await createClient();
  const { error } = await supabase.from("payment_methods").update({ name: name.data }).eq("id", id);
  return error ? failure(error.code) : done("saved=1");
}

/** Methods are never deleted (old payments keep them); hiding removes them from new choices. */
export async function togglePaymentMethod(id: string, active: boolean) {
  await guard();
  const supabase = await createClient();
  await supabase.from("payment_methods").update({ is_active: active }).eq("id", id);
  return done("saved=1");
}
