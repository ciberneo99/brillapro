"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { todayIso } from "@/lib/calendar";
import { recurringSchema } from "./module";

const BACK = "/jobs/recurring";
const UUID = /^[0-9a-f-]{36}$/i;
const HORIZON_DAYS = 84; // 12 weeks of jobs are created ahead

function plusDays(isoDate: string, n: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function guard() {
  const ctx = await requireContext();
  if (!can(ctx.role, "jobs:write")) redirect("/jobs");
  return ctx;
}

export async function createSchedule(formData: FormData) {
  const ctx = await guard();
  const customerId = String(formData.get("customer_id") ?? "");
  if (!UUID.test(customerId)) redirect(`${BACK}?error=invalid`);
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string"));
  const p = recurringSchema.safeParse(raw);
  if (!p.success) redirect(`${BACK}?error=invalid`);
  const employeeIds = formData.getAll("employee_ids").map(String).filter((x) => UUID.test(x));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recurring_schedules")
    .insert({ ...p.data, tenant_id: ctx.tenant.id, customer_id: customerId, created_by: ctx.userId })
    .select("id").single();
  if (error || !data) redirect(`${BACK}?error=invalid`);
  if (employeeIds.length) {
    await supabase.from("recurring_schedule_employees").insert(employeeIds.map((e) => ({ tenant_id: ctx.tenant.id, schedule_id: data.id, employee_id: e })));
  }
  const through = plusDays(todayIso(ctx.settings.timezone), HORIZON_DAYS);
  const { data: n } = await supabase.rpc("generate_recurring_jobs", { p_schedule: data.id, p_through: through });
  revalidatePath(BACK);
  revalidatePath("/calendar");
  redirect(`${BACK}?created=${Number(n ?? 0)}`);
}

export async function extendSchedule(id: string) {
  const ctx = await guard();
  const supabase = await createClient();
  const { data: n } = await supabase.rpc("generate_recurring_jobs", { p_schedule: id, p_through: plusDays(todayIso(ctx.settings.timezone), HORIZON_DAYS) });
  revalidatePath(BACK);
  revalidatePath("/calendar");
  redirect(`${BACK}?created=${Number(n ?? 0)}`);
}

export async function endSchedule(id: string, cancelFuture: boolean) {
  await guard();
  const supabase = await createClient();
  const { data: n } = await supabase.rpc("end_recurring", { p_schedule: id, p_cancel_future: cancelFuture });
  revalidatePath(BACK);
  revalidatePath("/calendar");
  revalidatePath("/jobs");
  redirect(`${BACK}?ended=${Number(n ?? 0)}`);
}

/** Deletes every job of the series that can be erased (the others are cancelled) and ends the series. */
export async function deleteSeries(id: string) {
  await guard();
  if (!UUID.test(id)) redirect(BACK);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_series", { p_schedule: id });
  revalidatePath(BACK);
  revalidatePath("/calendar");
  revalidatePath("/jobs");
  if (error) redirect(`${BACK}?error=invalid`);
  const r = (Array.isArray(data) ? data[0] : data) as { deleted?: number; cancelled?: number } | null;
  redirect(`${BACK}?removed=${Number(r?.deleted ?? 0)}&cancelled=${Number(r?.cancelled ?? 0)}`);
}
