import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Today's date (YYYY-MM-DD) in the company's timezone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const monthKey = (iso: string) => iso.slice(0, 7);

/** The 12 month keys (YYYY-MM) ending at `today`'s month, oldest first. */
export function lastMonths(today: string, n = 12): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export type Payment = { paid_on: string; amount_cents: number; method: string };
export type Expense = { expense_date: string; amount_cents: number };
export type DashboardJob = { id: string; title: string; customer_name: string; scheduled_date: string; start_time: string | null; status: string };
export type DashboardTask = { id: string; title: string; due_date: string | null };

export type DashboardData = {
  months: string[];
  payments: Payment[] | null;
  expenses: Expense[] | null;
  outstanding: { cents: number; count: number } | null;
  invoicedThisMonth: { cents: number; count: number } | null;
  customers: { active: number; newThis: number; newLast: number } | null;
  completedJobs: { thisMonth: number; lastMonth: number } | null;
  upcoming: DashboardJob[] | null;
  tasks: DashboardTask[] | null;
};

/** Everything runs under the signed-in user's RLS; blocks the role can't read come back null. */
export async function getDashboard(opts: { today: string; money: boolean; spend: boolean; people: boolean; jobs: boolean; tasks: boolean }): Promise<DashboardData> {
  const supabase = await createClient();
  const months = lastMonths(opts.today);
  const from = `${months[0]}-01`;
  const thisMonth = monthKey(opts.today);
  const lastMonth = months[months.length - 2];
  const lastStart = `${lastMonth}-01`;

  const [payments, expenses, outstanding, invoiced, active, newCust, completed, upcoming, tasks] = await Promise.all([
    opts.money ? supabase.from("payments").select("paid_on,amount_cents,method").gte("paid_on", from).limit(20000) : null,
    opts.spend ? supabase.from("expenses").select("expense_date,amount_cents").gte("expense_date", from).limit(20000) : null,
    opts.money ? supabase.from("invoices_overview").select("balance_cents").in("display_status", ["sent", "partial", "overdue"]).gt("balance_cents", 0).limit(20000) : null,
    opts.money ? supabase.from("invoices_overview").select("total_cents").neq("status", "void").neq("status", "draft").gte("issue_date", `${thisMonth}-01`).limit(20000) : null,
    opts.people ? supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "active") : null,
    opts.people ? supabase.from("customers").select("created_at").neq("status", "archived").gte("created_at", `${lastStart}T00:00:00Z`).limit(20000) : null,
    opts.jobs ? supabase.from("jobs").select("completed_at").eq("status", "completed").gte("completed_at", `${lastStart}T00:00:00Z`).limit(20000) : null,
    opts.jobs ? supabase.from("jobs").select("id,title,customer_name,scheduled_date,start_time,status").in("status", ["scheduled", "in_progress"]).gte("scheduled_date", opts.today).order("scheduled_date").order("start_time", { nullsFirst: false }).limit(5) : null,
    opts.tasks ? supabase.from("tasks").select("id,title,due_date").eq("is_done", false).order("due_date", { nullsFirst: false }).order("created_at", { ascending: false }).limit(5) : null,
  ]);

  const inMonth = (iso: string, key: string) => iso.slice(0, 7) === key;
  const ob = outstanding?.data ?? [];
  const inv = invoiced?.data ?? [];
  const nc = newCust?.data ?? [];
  const cj = completed?.data ?? [];

  return {
    months,
    payments: payments ? ((payments.data ?? []) as Payment[]) : null,
    expenses: expenses ? ((expenses.data ?? []) as Expense[]) : null,
    outstanding: outstanding ? { cents: ob.reduce((s, r) => s + (r.balance_cents ?? 0), 0), count: ob.length } : null,
    invoicedThisMonth: invoiced ? { cents: inv.reduce((s, r) => s + (r.total_cents ?? 0), 0), count: inv.length } : null,
    customers: active ? { active: active.count ?? 0, newThis: nc.filter((r) => inMonth(r.created_at, thisMonth)).length, newLast: nc.filter((r) => inMonth(r.created_at, lastMonth)).length } : null,
    completedJobs: completed ? { thisMonth: cj.filter((r) => r.completed_at && inMonth(r.completed_at, thisMonth)).length, lastMonth: cj.filter((r) => r.completed_at && inMonth(r.completed_at, lastMonth)).length } : null,
    upcoming: upcoming ? ((upcoming.data ?? []) as DashboardJob[]) : null,
    tasks: tasks ? ((tasks.data ?? []) as DashboardTask[]) : null,
  };
}

export const sumByMonth = (rows: { date: string; cents: number }[], months: string[]): number[] =>
  months.map((m) => rows.filter((r) => r.date.slice(0, 7) === m).reduce((s, r) => s + r.cents, 0));
