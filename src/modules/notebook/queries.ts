import "server-only";
import { createClient } from "@/lib/supabase/server";

export type TimeEntry = {
  id: string; employee_id: string; employeeName: string; job_id: string | null; jobTitle: string | null;
  clock_in: string; clock_out: string | null; notes: string | null;
};

/** The signed-in user's employee record in this company (needed to clock in). */
export async function myEmployee(tenantId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("id,full_name").eq("tenant_id", tenantId).eq("user_id", userId).eq("is_active", true).maybeSingle();
  return data;
}

export async function myOpenJobs(employeeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_assignments").select("job_id, jobs(id,title,scheduled_date,status)").eq("employee_id", employeeId);
  return (data ?? [])
    .map((r) => r.jobs as unknown as { id: string; title: string; scheduled_date: string; status: string } | null)
    .filter((j): j is NonNullable<typeof j> => !!j && (j.status === "scheduled" || j.status === "in_progress"))
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    .slice(0, 40);
}

/** Entries whose clock-in falls in [fromTs, toTs). RLS limits employees to their own. */
export async function listTimeEntries(fromTs: string, toTs: string, employeeId?: string): Promise<TimeEntry[]> {
  const supabase = await createClient();
  let q = supabase
    .from("time_entries").select("id,employee_id,job_id,clock_in,clock_out,notes,employees(full_name),jobs(title)")
    .gte("clock_in", fromTs).lt("clock_in", toTs).order("clock_in", { ascending: false }).limit(1000);
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id, employee_id: r.employee_id, job_id: r.job_id, clock_in: r.clock_in, clock_out: r.clock_out, notes: r.notes,
    employeeName: (r.employees as unknown as { full_name: string } | null)?.full_name ?? "",
    jobTitle: (r.jobs as unknown as { title: string } | null)?.title ?? null,
  }));
}

export async function openEntry(employeeId: string): Promise<TimeEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("time_entries").select("id,employee_id,job_id,clock_in,clock_out,notes,jobs(title)").eq("employee_id", employeeId).is("clock_out", null).maybeSingle();
  if (!data) return null;
  return { ...data, employeeName: "", jobTitle: (data.jobs as unknown as { title: string } | null)?.title ?? null };
}

export type Note = { id: string; title: string; body: string; updated_at: string };
export async function listNotes(): Promise<Note[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("user_notes").select("id,title,body,updated_at").order("updated_at", { ascending: false }).limit(200);
  return data ?? [];
}

export type Task = {
  id: string; title: string; notes: string | null; due_date: string | null; is_done: boolean; completed_at: string | null;
  assigned_to: string | null; assigneeName: string; created_by: string;
};
export async function listTasks(): Promise<Task[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks").select("id,title,notes,due_date,is_done,completed_at,assigned_to,created_by,profiles!tasks_assigned_to_fkey(full_name,email)")
    .order("is_done").order("due_date", { nullsFirst: false }).order("created_at", { ascending: false }).limit(300);
  return (data ?? []).map((r) => {
    const p = r.profiles as unknown as { full_name: string | null; email: string } | null;
    return { ...r, assigneeName: p ? (p.full_name || p.email) : "" } as Task;
  });
}

export async function listMembers(tenantId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships").select("user_id,role,profiles(full_name,email)").eq("tenant_id", tenantId).eq("status", "active");
  return (data ?? []).map((m) => {
    const p = m.profiles as unknown as { full_name: string | null; email: string } | null;
    return { user_id: m.user_id as string, role: m.role as string, label: p ? (p.full_name || p.email) : "" };
  }).sort((a, b) => a.label.localeCompare(b.label));
}
