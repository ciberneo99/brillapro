// Draft plans (USD). Single source of truth for the landing page now and for limits/billing later.
// All plans include every feature; they differ by how many people can sign in. Employees without a login do not count.

export type PlanId = "starter" | "pro" | "business";

export type PlanDef = {
  id: PlanId;
  monthlyCents: number;
  /** Yearly = 10 months (two months free). */
  yearlyCents: number;
  /** Maximum people with a login (owner, admins, managers, office staff, accountant, employees with an account). */
  maxUsers: number;
  highlight?: boolean;
};

export const PLANS: readonly PlanDef[] = [
  { id: "starter", monthlyCents: 1900, yearlyCents: 19000, maxUsers: 3 },
  { id: "pro", monthlyCents: 3900, yearlyCents: 39000, maxUsers: 10, highlight: true },
  { id: "business", monthlyCents: 7900, yearlyCents: 79000, maxUsers: 25 },
] as const;

export const TRIAL_DAYS = 14;
