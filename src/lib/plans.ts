// Public plans (USD). Single source of truth for the landing page and, later, billing. Mirrors db/migrations/0027_two_plans.sql.
// Employees without a login do not count as users. Customers counted are the ones not archived.

export type PlanId = "starter" | "pro";

export type PlanDef = {
  id: PlanId;
  monthlyCents: number;
  /** Yearly = 10 months (two months free). */
  yearlyCents: number;
  /** Maximum people with a login (owner, admins, managers, office staff, accountant, employees with an account). */
  maxUsers: number;
  /** Maximum active (not archived) customers; null = no limit. */
  maxCustomers: number | null;
  /** "basic" = a selection of reports; "full" = all of them. */
  reports: "basic" | "full";
  highlight?: boolean;
};

export const PLANS: readonly PlanDef[] = [
  { id: "starter", monthlyCents: 3900, yearlyCents: 39000, maxUsers: 1, maxCustomers: 50, reports: "basic" },
  { id: "pro", monthlyCents: 7900, yearlyCents: 79000, maxUsers: 10, maxCustomers: null, reports: "full", highlight: true },
] as const;

export const TRIAL_DAYS = 14;
