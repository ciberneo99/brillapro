import "server-only";
import { createClient } from "@/lib/supabase/server";
import { JOB_STATUSES } from "./schema";

export const PAGE_SIZE = 25;

export type JobRow = {
  id: string; title: string; status: string; scheduled_date: string; start_time: string | null; end_time: string | null;
  customer_name: string; address: string | null; price_cents: number; customer_id: string;
};
const COLS = "id,title,status,scheduled_date,start_time,end_time,customer_name,address,price_cents,customer_id";

export async function listJobs(params: { status?: string; customerId?: string; from?: string; to?: string; page?: number; asc?: boolean }) {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(params.page ?? 1));
  let q = supabase.from("jobs").select(COLS, { count: "exact" });
  if (params.status && (JOB_STATUSES as readonly string[]).includes(params.status)) q = q.eq("status", params.status);
  if (params.customerId) q = q.eq("customer_id", params.customerId);
  if (params.from) q = q.gte("scheduled_date", params.from);
  if (params.to) q = q.lte("scheduled_date", params.to);
  const { data, count } = await q
    .order("scheduled_date", { ascending: params.asc ?? false })
    .order("start_time", { ascending: true, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  return { rows: (data ?? []) as JobRow[], total: count ?? 0, page };
}

export type JobDetail = JobRow & {
  service_type_id: string | null; quote_id: string | null; access_notes: string | null; notes: string | null; completed_at: string | null;
  assigned: { employee_id: string; full_name: string }[];
  items: { id: string; category: string; title: string; instructions: string | null; is_done: boolean; position: number }[];
};

export async function getJob(id: string): Promise<JobDetail | null> {
  const supabase = await createClient();
  const { data: j } = await supabase
    .from("jobs").select(`${COLS},service_type_id,quote_id,access_notes,notes,completed_at`).eq("id", id).maybeSingle();
  if (!j) return null;
  const [{ data: asg }, { data: items }] = await Promise.all([
    supabase.from("job_assignments").select("employee_id, employees(full_name)").eq("job_id", id),
    supabase.from("job_checklist_items").select("id,category,title,instructions,is_done,position").eq("job_id", id).order("position"),
  ]);
  return {
    ...(j as unknown as JobRow & Omit<JobDetail, keyof JobRow | "assigned" | "items">),
    assigned: (asg ?? []).map((a) => ({
      employee_id: a.employee_id as string,
      // Employees may not read the employees table for others; fall back to an empty name.
      full_name: ((a.employees as unknown as { full_name: string } | null)?.full_name) ?? "",
    })),
    items: items ?? [],
  };
}

/** Job already created from a quote (if any), for the quote page. */
export async function jobForQuote(quoteId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("jobs").select("id").eq("quote_id", quoteId).neq("status", "cancelled").limit(1);
  return data?.[0]?.id ?? null;
}

export type CalendarJob = Pick<JobRow, "id" | "title" | "status" | "scheduled_date" | "start_time" | "end_time" | "customer_name">;

/** Jobs between two dates (inclusive) for the calendar; optional employee filter (staff only in practice). */
export async function jobsInRange(from: string, to: string, employeeId?: string): Promise<CalendarJob[]> {
  const supabase = await createClient();
  let ids: string[] | null = null;
  if (employeeId) {
    const { data } = await supabase.from("job_assignments").select("job_id").eq("employee_id", employeeId);
    ids = (data ?? []).map((r) => r.job_id as string);
    if (ids.length === 0) return [];
  }
  let q = supabase
    .from("jobs").select("id,title,status,scheduled_date,start_time,end_time,customer_name")
    .gte("scheduled_date", from).lte("scheduled_date", to)
    .order("scheduled_date").order("start_time", { nullsFirst: false }).limit(2000);
  if (ids) q = q.in("id", ids);
  const { data } = await q;
  return (data ?? []) as CalendarJob[];
}
