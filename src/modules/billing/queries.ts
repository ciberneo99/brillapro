import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PlanOverview = {
  planId: string;
  planName: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "suspended";
  trialEndsAt: string | null;
  monthlyCents: number | null;
  users: number;
  maxUsers: number | null;
  customers: number;
  maxCustomers: number | null;
};

/** The company's plan, status and how many of its seats are used. Read under RLS (members only). */
export async function getPlanOverview(tenantId: string): Promise<PlanOverview | null> {
  const supabase = await createClient();
  const [{ data: sub }, { data: usage }] = await Promise.all([
    supabase.from("subscriptions").select("plan_id,status,trial_ends_at,plans(name,price_monthly_cents)").eq("tenant_id", tenantId).maybeSingle(),
    supabase.rpc("tenant_usage", { p_tenant: tenantId }),
  ]);
  if (!sub) return null;
  const plan = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;
  const u = (usage as { users: number; max_users: number | null; customers: number; max_customers: number | null }[] | null)?.[0];
  return {
    planId: sub.plan_id, planName: plan?.name ?? sub.plan_id, status: sub.status as PlanOverview["status"], trialEndsAt: sub.trial_ends_at,
    monthlyCents: plan?.price_monthly_cents ?? null, users: u?.users ?? 0, maxUsers: u?.max_users ?? null,
    customers: u?.customers ?? 0, maxCustomers: u?.max_customers ?? null,
  };
}
