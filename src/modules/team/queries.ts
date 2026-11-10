import "server-only";
import { createClient } from "@/lib/supabase/server";

export const TEAM_ROLES = ["owner", "admin", "manager", "office_staff", "employee", "accountant"] as const;
export const INVITE_ROLES = ["admin", "manager", "office_staff", "employee", "accountant"] as const;

export type TeamMember = { id: string; user_id: string; role: string; status: "active" | "disabled"; full_name: string; email: string };
export type PendingInvite = { id: string; email: string; role: string; expires_at: string; created_at: string };

export async function listTeam(tenantId: string): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("id, user_id, role, status, profile:profiles(full_name, email)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((m) => {
    const p = Array.isArray(m.profile) ? m.profile[0] : m.profile;
    return { id: m.id, user_id: m.user_id, role: m.role, status: m.status as TeamMember["status"], full_name: p?.full_name ?? "", email: p?.email ?? "" };
  });
}

export async function listPendingInvites(tenantId: string): Promise<PendingInvite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return data ?? [];
}
