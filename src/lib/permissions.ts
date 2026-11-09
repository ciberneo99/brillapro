// Role → permission matrix. Checked on the server for every action (never trust the UI).
// RLS in the database is the second barrier; this module is the first.

export const ROLES = ["owner", "admin", "manager", "office_staff", "employee", "accountant"] as const;
export type Role = (typeof ROLES)[number];

export const RESOURCES = [
  "dashboard", "customers", "jobs", "quotes", "invoices", "expenses", "calendar",
  "inventory", "notebook", "reports", "venmo", "settings", "users", "services", "checklists", "employees",
] as const;
export type Resource = (typeof RESOURCES)[number];
export type Action = "read" | "write";
export type Permission = `${Resource}:${Action}`;

const all = (...a: Action[]) => a;

const MATRIX: Record<Role, Partial<Record<Resource, Action[]>>> = {
  owner: Object.fromEntries(RESOURCES.map((r) => [r, all("read", "write")])),
  admin: Object.fromEntries(RESOURCES.map((r) => [r, all("read", "write")])),
  manager: {
    dashboard: all("read"), customers: all("read", "write"), jobs: all("read", "write"),
    quotes: all("read", "write"), calendar: all("read", "write"), inventory: all("read", "write"),
    notebook: all("read", "write"), reports: all("read"), users: all("read"),
    services: all("read"), checklists: all("read", "write"), employees: all("read", "write"),
  },
  office_staff: {
    dashboard: all("read"), customers: all("read", "write"), jobs: all("read", "write"),
    quotes: all("read", "write"), invoices: all("read", "write"), expenses: all("read", "write"),
    calendar: all("read", "write"), notebook: all("read", "write"),
    services: all("read"), checklists: all("read"), employees: all("read"),
  },
  employee: {
    jobs: all("read"), calendar: all("read"), notebook: all("read", "write"),
    services: all("read"), checklists: all("read"),
  },
  accountant: {
    dashboard: all("read"), invoices: all("read"), expenses: all("read"),
    reports: all("read"), venmo: all("read"),
  },
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const [resource, action] = permission.split(":") as [Resource, Action];
  return MATRIX[role]?.[resource]?.includes(action) ?? false;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
