import type { Permission } from "@/lib/permissions";

export type ReportSection = "sales" | "payments" | "accounting" | "banking";
export type ReportIcon =
  | "file-text" | "shopping-cart" | "users" | "clock" | "dollar" | "credit-card" | "wallet" | "trending-up" | "receipt" | "landmark" | "layout";

export type ReportDef = {
  key: string;
  section: ReportSection;
  icon: ReportIcon;
  /** Everything the person must be allowed to read to see this report. */
  needs: Permission[];
  /** Where View goes when it isn't the generic report page. */
  href?: string;
  /** Takes a date range (month, year or custom). Aging is "as of today". */
  ranged: boolean;
  /** Has a CSV download. */
  csv: boolean;
  /** Not possible yet: the app doesn't record the data it needs. */
  unavailable?: boolean;
};

export const SECTIONS: { id: ReportSection; accent: "blue" | "green" | "violet" | "teal" }[] = [
  { id: "sales", accent: "blue" },
  { id: "payments", accent: "green" },
  { id: "accounting", accent: "violet" },
  { id: "banking", accent: "teal" },
];

export const REPORTS: readonly ReportDef[] = [
  { key: "invoice_details", section: "sales", icon: "file-text", needs: ["invoices:read"], ranged: true, csv: true },
  { key: "item_sales", section: "sales", icon: "shopping-cart", needs: ["invoices:read"], ranged: true, csv: true },
  { key: "revenue_by_client", section: "sales", icon: "users", needs: ["invoices:read"], ranged: true, csv: true },
  { key: "accounts_aging", section: "payments", icon: "clock", needs: ["invoices:read"], ranged: false, csv: true },
  { key: "payments_collected", section: "payments", icon: "dollar", needs: ["invoices:read"], ranged: true, csv: true },
  { key: "profit_loss", section: "accounting", icon: "trending-up", needs: ["invoices:read", "expenses:read"], ranged: true, csv: true },
  { key: "sales_tax", section: "accounting", icon: "receipt", needs: ["invoices:read"], ranged: true, csv: true },
  { key: "expense_report", section: "accounting", icon: "wallet", needs: ["expenses:read"], ranged: true, csv: true },
  { key: "overview", section: "accounting", icon: "layout", needs: ["reports:read"], href: "/reports/overview", ranged: true, csv: false },
  { key: "bank_reports", section: "banking", icon: "landmark", needs: ["venmo:read"], href: "/reports/bank", ranged: false, csv: false },
] as const;

export const reportByKey = (key: string): ReportDef | undefined => REPORTS.find((r) => r.key === key);

/** The Starter plan only includes these reports; every other plan (Pro, trial) has them all. */
export const STARTER_REPORTS: readonly string[] = ["payments_collected", "revenue_by_client"];
export const reportInPlan = (key: string, planId: string | null): boolean => planId !== "starter" || STARTER_REPORTS.includes(key);
