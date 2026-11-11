"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { parseTime } from "@/lib/time";
import { noteText, sanitizeNoteHtml } from "@/lib/note-html";
import { normalizeName, normalizeSentences } from "@/lib/text";

const UUID = /^[0-9a-f-]{36}$/i;
const raw = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"));
const sentence = (max: number) =>
  z.string().optional().transform((v) => normalizeSentences(v ?? "").trim()).pipe(z.string().max(max)).transform((v) => v || null);

async function member() {
  const ctx = await requireContext();
  if (!can(ctx.role, "notebook:write")) redirect("/notebook");
  return ctx;
}

// ───────── time ─────────
export async function clockIn(formData: FormData) {
  const ctx = await member();
  const job = String(formData.get("job_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("clock_in", { p_tenant: ctx.tenant.id, p_job: UUID.test(job) ? job : null });
  revalidatePath("/notebook/time");
  redirect(`/notebook/time${error ? "?error=clock" : ""}`);
}

export async function clockOut() {
  const ctx = await member();
  const supabase = await createClient();
  const { error } = await supabase.rpc("clock_out", { p_tenant: ctx.tenant.id });
  revalidatePath("/notebook/time");
  redirect(`/notebook/time${error ? "?error=clock" : ""}`);
}

const manualSchema = z.object({
  employee_id: z.string().uuid(),
  job_id: z.string().optional().transform((v) => (v ? v : null)).pipe(z.string().uuid().nullable()),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().transform((v) => parseTime(v)).pipe(z.string()),
  end: z.string().transform((v) => parseTime(v)).pipe(z.string()),
  notes: sentence(500),
});

export async function addTimeEntry(formData: FormData) {
  const ctx = await requireContext();
  if (!can(ctx.role, "employees:write")) redirect("/notebook/time");
  const p = manualSchema.safeParse(raw(formData));
  if (!p.success || p.data.end <= p.data.start) redirect("/notebook/time?error=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_time_entry", {
    p_employee: p.data.employee_id, p_job: p.data.job_id, p_date: p.data.date, p_start: p.data.start, p_end: p.data.end, p_notes: p.data.notes ?? "",
  });
  revalidatePath("/notebook/time");
  redirect(`/notebook/time${error ? "?error=invalid" : "?saved=1"}`);
}

export async function deleteTimeEntry(id: string) {
  const ctx = await requireContext();
  if (!can(ctx.role, "employees:write")) redirect("/notebook/time");
  const supabase = await createClient();
  await supabase.from("time_entries").delete().eq("id", id);
  revalidatePath("/notebook/time");
  redirect("/notebook/time");
}

// ───────── notes ─────────
const noteSchema = z.object({
  title: z.string().optional().transform((v) => normalizeName(v ?? "").trim()).pipe(z.string().max(120)),
  body: z.string().optional().transform((v) => normalizeSentences(v ?? "").trimEnd()).pipe(z.string().max(10000)),
});

export async function saveNote(id: string | null, formData: FormData) {
  const ctx = await member();
  const p = noteSchema.safeParse(raw(formData));
  if (!p.success || (!p.data.title && !p.data.body)) redirect("/notebook/notes?error=invalid");
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("user_notes").update(p.data).eq("id", id)
    : await supabase.from("user_notes").insert({ ...p.data, tenant_id: ctx.tenant.id, user_id: ctx.userId });
  revalidatePath("/notebook/notes");
  redirect(`/notebook/notes${error ? "?error=invalid" : ""}`);
}

export async function deleteNote(id: string) {
  await member();
  const supabase = await createClient();
  await supabase.from("user_notes").delete().eq("id", id);
  revalidatePath("/notebook/notes");
  redirect("/notebook/notes");
}

// ───────── tasks ─────────
const taskSchema = z.object({
  title: z.string().transform((v) => normalizeSentences(v).trim()).pipe(z.string().min(1).max(200)),
  notes: sentence(2000),
  due_date: z.string().optional().transform((v) => (v ? v : null)).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  assigned_to: z.string().optional().transform((v) => (v ? v : null)).pipe(z.string().uuid().nullable()),
});

export async function createTask(formData: FormData) {
  const ctx = await member();
  const p = taskSchema.safeParse(raw(formData));
  if (!p.success) redirect("/notebook/tasks?error=invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({ ...p.data, tenant_id: ctx.tenant.id, created_by: ctx.userId });
  revalidatePath("/notebook/tasks");
  redirect(`/notebook/tasks${error ? "?error=invalid" : ""}`);
}

export async function setTaskDone(id: string, done: boolean) {
  await member();
  const supabase = await createClient();
  await supabase.rpc("set_task_done", { p_task: id, p_done: done });
  revalidatePath("/notebook/tasks");
  redirect("/notebook/tasks");
}

export async function deleteTask(id: string) {
  await member();
  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("id", id);
  revalidatePath("/notebook/tasks");
  redirect("/notebook/tasks");
}

// ───────── notes attached to a customer (shown on the customer page) ─────────
export async function saveCustomerNote(customerId: string, formData: FormData) {
  const ctx = await member();
  if (!UUID.test(customerId)) redirect("/customers");
  const html = sanitizeNoteHtml(String(formData.get("body") ?? ""));
  if (!noteText(html) || html.length > 10000) redirect(`/customers/${customerId}?note=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.from("user_notes").insert({ title: "", body: html, tenant_id: ctx.tenant.id, user_id: ctx.userId, customer_id: customerId });
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}${error ? "?note=invalid" : ""}`);
}

export async function deleteCustomerNote(customerId: string, noteId: string) {
  await member();
  const supabase = await createClient();
  await supabase.from("user_notes").delete().eq("id", noteId);
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}`);
}
