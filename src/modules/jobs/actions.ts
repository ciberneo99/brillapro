"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createSchedule } from "@/modules/recurring/actions";
import { FREQUENCIES } from "@/modules/recurring/module";
import { JOB_STATUSES, jobSchema } from "./schema";

const raw = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"));
const UUID = /^[0-9a-f-]{36}$/i;
const page = (id: string, q = "") => `/jobs/${id}${q}`;

async function guard() {
  const ctx = await requireContext();
  if (!can(ctx.role, "jobs:write")) redirect("/jobs");
  return ctx;
}

export async function createJob(formData: FormData) {
  const ctx = await guard();
  const customerId = String(formData.get("customer_id") ?? "");
  if (!UUID.test(customerId)) redirect("/jobs/new?error=invalid");
  const supabase = await createClient();

  // The new-job form has no title box: it is the chosen service (or "Cleaning").
  const input = raw(formData);
  const serviceId = UUID.test(String(input.service_type_id ?? "")) ? String(input.service_type_id) : "";
  if (!String(input.title ?? "").trim()) {
    const { data: svc } = serviceId ? await supabase.from("service_types").select("name").eq("id", serviceId).maybeSingle() : { data: null };
    input.title = svc?.name ?? "Cleaning";
  }
  const employeeId = UUID.test(String(input.employee_id ?? "")) ? String(input.employee_id) : "";

  // A repeating job is a recurring schedule: it creates its jobs for the next 12 weeks.
  if ((FREQUENCIES as readonly string[]).includes(String(input.frequency ?? ""))) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(input)) fd.set(k, String(v));
    fd.set("start_date", String(input.scheduled_date ?? ""));
    if (employeeId) fd.set("employee_ids", employeeId);
    return createSchedule(fd);
  }

  const p = jobSchema.safeParse(input);
  if (!p.success) redirect(`/jobs/new?error=invalid&customer=${customerId}`);
  const { data: c } = await supabase
    .from("customers").select("first_name,last_name,company_name,service_address,city,state,zip_code,access_instructions").eq("id", customerId).single();
  if (!c) redirect("/jobs/new?error=invalid");
  const name = `${c.first_name} ${c.last_name}`.trim() || c.company_name;
  const fallbackAddress = [c.service_address, c.city, [c.state, c.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      ...p.data, tenant_id: ctx.tenant.id, customer_id: customerId, created_by: ctx.userId, customer_name: name,
      address: p.data.address ?? fallbackAddress, access_notes: p.data.access_notes ?? c.access_instructions ?? null,
    })
    .select("id").single();
  if (error || !data) redirect(`/jobs/new?error=invalid&customer=${customerId}`);
  await supabase.rpc("snapshot_job_checklist", { p_job: data.id });
  if (employeeId) {
    await supabase.from("job_assignments").upsert({ tenant_id: ctx.tenant.id, job_id: data.id, employee_id: employeeId }, { onConflict: "job_id,employee_id", ignoreDuplicates: true });
  }
  const status = String(input.status ?? "scheduled");
  if (status !== "scheduled" && (JOB_STATUSES as readonly string[]).includes(status)) await supabase.rpc("set_job_status", { p_job: data.id, p_status: status });
  revalidatePath("/jobs");
  revalidatePath("/calendar");
  redirect(page(data.id));
}

export async function createJobFromQuote(quoteId: string, formData: FormData) {
  await guard();
  const date = String(formData.get("scheduled_date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect(`/quotes/${quoteId}?error=invalid`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_job_from_quote", { p_quote: quoteId, p_date: date });
  if (error || !data) redirect(`/quotes/${quoteId}?error=invalid`);
  revalidatePath("/jobs");
  redirect(page(data as string));
}

export async function updateJob(id: string, formData: FormData) {
  await guard();
  const p = jobSchema.safeParse(raw(formData));
  if (!p.success) redirect(page(id, "?error=invalid"));
  const supabase = await createClient();
  // "This and following" on a series job: edit it and every later job, and move them to a new date / frequency (like Google Calendar).
  if (String(formData.get("series_scope")) === "following") {
    const d = p.data;
    const freq = String(formData.get("series_frequency") ?? "");
    const { error: e2 } = await supabase.rpc("update_series_from", {
      p_job: id, p_frequency: (FREQUENCIES as readonly string[]).includes(freq) ? freq : null, p_title: d.title, p_service: d.service_type_id ?? null,
      p_date: d.scheduled_date, p_start: d.start_time ?? null, p_end: d.end_time ?? null, p_address: d.address ?? null,
      p_access: d.access_notes ?? null, p_price: d.price_cents, p_notes: d.notes ?? null,
    });
    revalidatePath("/jobs"); revalidatePath("/calendar"); revalidatePath("/jobs/recurring");
    redirect(page(id, e2 ? "?error=series" : "?saved=1"));
  }
  const { data, error } = await supabase.from("jobs").update(p.data).eq("id", id).select("id");
  revalidatePath("/jobs");
  redirect(page(id, error || !data?.length ? "?error=invalid" : "?saved=1"));
}

/** Staff: any status. Assigned employee: scheduled → in_progress → completed (enforced in the database). */
export async function setJobStatus(id: string, status: string) {
  await requireContext();
  if (!(JOB_STATUSES as readonly string[]).includes(status)) redirect(page(id));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_job_status", { p_job: id, p_status: status });
  revalidatePath("/jobs");
  redirect(page(id, error ? "?error=status" : ""));
}

export async function toggleJobItem(jobId: string, itemId: string, done: boolean) {
  await requireContext();
  const supabase = await createClient();
  await supabase.rpc("set_job_item_done", { p_item: itemId, p_done: done });
  revalidatePath(page(jobId));
  redirect(page(jobId));
}

export async function loadChecklist(id: string) {
  await guard();
  const supabase = await createClient();
  await supabase.rpc("snapshot_job_checklist", { p_job: id });
  revalidatePath(page(id));
  redirect(page(id));
}

export async function assignEmployee(id: string, formData: FormData) {
  const ctx = await guard();
  const employeeId = String(formData.get("employee_id") ?? "");
  if (!UUID.test(employeeId)) redirect(page(id));
  const supabase = await createClient();
  await supabase.from("job_assignments").upsert(
    { tenant_id: ctx.tenant.id, job_id: id, employee_id: employeeId }, { onConflict: "job_id,employee_id", ignoreDuplicates: true },
  );
  revalidatePath(page(id));
  redirect(page(id));
}

export async function unassignEmployee(id: string, employeeId: string) {
  await guard();
  const supabase = await createClient();
  await supabase.from("job_assignments").delete().eq("job_id", id).eq("employee_id", employeeId);
  revalidatePath(page(id));
  redirect(page(id));
}

/** Delete from the job page: scope is one | following | series. Jobs with an invoice, expense, hours or inventory use are cancelled instead. */
export async function deleteJob(id: string, scope: string) {
  const ctx = await requireContext();
  if (!can(ctx.role, "jobs:write")) redirect(page(id));
  if (!["one", "following", "series"].includes(scope) || !/^[0-9a-f-]{36}$/i.test(id)) redirect(page(id));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_jobs", { p_job: id, p_scope: scope });
  revalidatePath("/jobs");
  revalidatePath("/calendar");
  revalidatePath("/jobs/recurring");
  if (error) redirect(page(id, "?error=delete"));
  const r = (Array.isArray(data) ? data[0] : data) as { deleted?: number; cancelled?: number } | null;
  redirect(`/jobs?deleted=${Number(r?.deleted ?? 0)}&cancelled=${Number(r?.cancelled ?? 0)}`);
}
