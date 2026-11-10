"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const BACK = "/admin";

async function guard() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  if (data !== true) notFound();
  return supabase;
}

const id = z.uuid();

export async function setCompanyStatus(tenantId: string, status: "active" | "suspended", formData: FormData) {
  const supabase = await guard();
  if (!id.safeParse(tenantId).success) redirect(`${BACK}?error=1`);
  const reason = String(formData.get("reason") ?? "").slice(0, 500);
  const { error } = await supabase.rpc("platform_set_company_status", { p_tenant: tenantId, p_status: status, p_reason: reason });
  revalidatePath(BACK);
  redirect(error ? `${BACK}?error=1` : `${BACK}?saved=1`);
}

export async function setCompanyPlan(tenantId: string, formData: FormData) {
  const supabase = await guard();
  const p = z.object({
    plan: z.enum(["trial", "starter", "pro", "business"]),
    status: z.enum(["trialing", "active", "past_due", "canceled", "suspended"]),
  }).safeParse({ plan: formData.get("plan"), status: formData.get("status") });
  if (!p.success || !id.safeParse(tenantId).success) redirect(`${BACK}?error=1`);
  const { error } = await supabase.rpc("platform_set_plan", { p_tenant: tenantId, p_plan: p.data.plan, p_status: p.data.status });
  revalidatePath(BACK);
  redirect(error ? `${BACK}?error=1` : `${BACK}?saved=1`);
}

export async function extendTrial(tenantId: string, formData: FormData) {
  const supabase = await guard();
  const days = z.coerce.number().int().min(1).max(90).safeParse(formData.get("days"));
  if (!days.success || !id.safeParse(tenantId).success) redirect(`${BACK}?error=1`);
  const { error } = await supabase.rpc("platform_extend_trial", { p_tenant: tenantId, p_days: days.data });
  revalidatePath(BACK);
  redirect(error ? `${BACK}?error=1` : `${BACK}?saved=1`);
}
