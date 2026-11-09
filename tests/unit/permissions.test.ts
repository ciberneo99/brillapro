import { describe, expect, it } from "vitest";
import { can, isRole, RESOURCES, ROLES } from "@/lib/permissions";

describe("permissions", () => {
  it("owner and admin can read and write every resource", () => {
    for (const role of ["owner", "admin"] as const)
      for (const r of RESOURCES) {
        expect(can(role, `${r}:read`)).toBe(true);
        expect(can(role, `${r}:write`)).toBe(true);
      }
  });

  it("employee only sees jobs/calendar and cannot touch money or customers", () => {
    expect(can("employee", "jobs:read")).toBe(true);
    expect(can("employee", "jobs:write")).toBe(false);
    for (const p of ["customers:read", "invoices:read", "expenses:read", "reports:read", "settings:read"] as const)
      expect(can("employee", p)).toBe(false);
  });

  it("accountant is read-only", () => {
    for (const r of RESOURCES) expect(can("accountant", `${r}:write`)).toBe(false);
    expect(can("accountant", "reports:read")).toBe(true);
    expect(can("accountant", "customers:read")).toBe(false);
  });

  it("only owner/admin manage settings and users", () => {
    for (const role of ROLES.filter((r) => r !== "owner" && r !== "admin")) {
      expect(can(role, "settings:write")).toBe(false);
      expect(can(role, "users:write")).toBe(false);
    }
  });

  it("denies missing or unknown roles", () => {
    expect(can(null, "dashboard:read")).toBe(false);
    expect(can(undefined, "dashboard:read")).toBe(false);
    expect(isRole("superuser")).toBe(false);
    expect(isRole("owner")).toBe(true);
  });
});

describe("services and checklists permissions", () => {
  it("everyone who works jobs can read; managers edit checklists; only owner/admin edit services", () => {
    for (const r of ["owner", "admin", "manager", "office_staff", "employee"] as const) {
      expect(can(r, "services:read")).toBe(true);
      expect(can(r, "checklists:read")).toBe(true);
    }
    expect(can("manager", "checklists:write")).toBe(true);
    expect(can("office_staff", "checklists:write")).toBe(false);
    expect(can("employee", "checklists:write")).toBe(false);
    expect(can("manager", "services:write")).toBe(false);
    expect(can("accountant", "services:read")).toBe(false);
    expect(can("accountant", "checklists:read")).toBe(false);
  });
});
