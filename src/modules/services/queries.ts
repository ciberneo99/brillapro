import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ServiceType = {
  id: string; code: string | null; name: string; sort_order: number; is_active: boolean;
  activeTemplateId: string | null;
};

/** Service types with the id of their active checklist (if any). RLS scopes everything to the tenant. */
export async function listServiceTypes(): Promise<ServiceType[]> {
  const supabase = await createClient();
  const [{ data: types }, { data: templates }] = await Promise.all([
    supabase.from("service_types").select("id,code,name,sort_order,is_active").order("sort_order").order("name"),
    supabase.from("checklist_templates").select("id,service_type_id").eq("is_active", true),
  ]);
  const byType = new Map((templates ?? []).map((t) => [t.service_type_id as string, t.id as string]));
  return (types ?? []).map((s) => ({ ...s, activeTemplateId: byType.get(s.id) ?? null }));
}
