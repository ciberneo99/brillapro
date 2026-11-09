import "server-only";
import { createClient } from "@/lib/supabase/server";

export type TemplateSummary = {
  id: string; name: string; is_active: boolean; service_type_id: string; item_count: number;
};
export type TemplateItem = { id: string; category: string; title: string; instructions: string | null; position: number };
export type TemplateDetail = {
  id: string; name: string; instructions: string | null; is_active: boolean; service_type_id: string; items: TemplateItem[];
};

export async function listTemplates(): Promise<TemplateSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("checklist_templates")
    .select("id,name,is_active,service_type_id,checklist_template_items(count)")
    .order("name");
  return (data ?? []).map((t) => ({
    id: t.id, name: t.name, is_active: t.is_active, service_type_id: t.service_type_id,
    item_count: (t.checklist_template_items as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));
}

export async function getTemplate(id: string): Promise<TemplateDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("checklist_templates").select("id,name,instructions,is_active,service_type_id").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: items } = await supabase
    .from("checklist_template_items").select("id,category,title,instructions,position")
    .eq("template_id", id).order("position").order("created_at");
  return { ...data, items: items ?? [] };
}
