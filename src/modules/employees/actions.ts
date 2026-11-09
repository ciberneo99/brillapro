"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { employeeSchema } from "./module";

const raw = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"));
const BACK = "/settings/employees";

async function guard() {
  const ctx = await requireContext();
  if (!can(ctx.role, "employees:write")) redirect(BACK);
  return ctx;
}

export async function addEmployee(formData: FormData) {
  const ctx = await guard();
  const p = employeeSchema.safeParse(raw(formData));
  if (!p.success) redirect(`${BACK}?error=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.from("employees").insert({ ...p.data, tenant_id: ctx.tenant.id });
  revalidatePath(BACK);
  redirect(error ? `${BACK}?error=invalid` : `${BACK}?saved=1`);
}

export async function updateEmployee(id: string, formData: FormData) {
  await guard();
  const p = employeeSchema.safeParse(raw(formData));
  if (!p.success) redirect(`${BACK}?error=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update(p.data).eq("id", id);
  revalidatePath(BACK);
  redirect(error ? `${BACK}?error=invalid` : `${BACK}?saved=1`);
}

export async function setEmployeeActive(id: string, active: boolean) {
  await guard();
  const supabase = await createClient();
  await supabase.from("employees").update({ is_active: active }).eq("id", id);
  revalidatePath(BACK);
  redirect(BACK);
}
