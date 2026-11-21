"use server";

import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { listCustomers } from "./queries";

export type QuickHit = { id: string; name: string; detail: string };

/** Top matches for the as-you-type search on the dashboard. Runs as the signed-in user, so RLS decides what is visible. */
export async function quickSearchCustomers(q: string): Promise<QuickHit[]> {
  const ctx = await requireContext();
  if (!can(ctx.role, "customers:read")) return [];
  const text = String(q ?? "").slice(0, 80);
  if (text.trim().length < 2) return [];
  const { rows } = await listCustomers({ q: text, sort: "name" });
  return rows.slice(0, 6).map((r) => ({
    id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.company_name || r.email || "—",
    detail: [r.phone, r.city].filter(Boolean).join(" · "),
  }));
}
