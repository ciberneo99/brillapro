import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function listFavorites(tenantId: string, userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("report_favorites").select("report_key").eq("tenant_id", tenantId).eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.report_key as string));
}
