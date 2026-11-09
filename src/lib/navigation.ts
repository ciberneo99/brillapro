import {
  LayoutDashboard, Users, Briefcase, FileText, Receipt, Wallet, CalendarDays,
  Boxes, NotebookPen, BarChart3, FileSpreadsheet, Settings, type LucideIcon,
} from "lucide-react";
import type { Resource } from "@/lib/permissions";

export type NavItem = { key: string; href: string; icon: LucideIcon; resource: Resource; phase: number };

/** Sidebar order is fixed by the product spec. `phase` = when the module becomes real. */
export const NAV: NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, resource: "dashboard", phase: 1 },
  { key: "customers", href: "/customers", icon: Users, resource: "customers", phase: 2 },
  { key: "jobs", href: "/jobs", icon: Briefcase, resource: "jobs", phase: 4 },
  { key: "quotes", href: "/quotes", icon: FileText, resource: "quotes", phase: 3 },
  { key: "invoices", href: "/invoices", icon: Receipt, resource: "invoices", phase: 5 },
  { key: "expenses", href: "/expenses", icon: Wallet, resource: "expenses", phase: 5 },
  { key: "calendar", href: "/calendar", icon: CalendarDays, resource: "calendar", phase: 4 },
  { key: "inventory", href: "/inventory", icon: Boxes, resource: "inventory", phase: 6 },
  { key: "notebook", href: "/notebook", icon: NotebookPen, resource: "notebook", phase: 4 },
  { key: "reports", href: "/reports", icon: BarChart3, resource: "reports", phase: 6 },
  { key: "venmo", href: "/venmo", icon: FileSpreadsheet, resource: "venmo", phase: 7 },
  { key: "settings", href: "/settings", icon: Settings, resource: "settings", phase: 1 },
];
