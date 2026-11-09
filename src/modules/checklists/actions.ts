"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { normalizeName, normalizeSentences } from "@/lib/text";
import { getTemplate } from "./queries";

const name = (max: number) => z.string().transform((v) => normalizeName(v).trim()).pipe(z.string().min(1).max(max));
const optText = (max: number) =>
  z.string().optional().transform((v) => normalizeSentences(v ?? "").trim()).pipe(z.string().max(max)).transform((v) => v || null);

const templateSchema = z.object({
  name: name(120), service_type_id: z.string().uuid(), instructions: optText(2000),
});
const itemSchema = z.object({
  category: z.string().optional().transform((v) => normalizeName(v ?? "").trim()).pipe(z.string().max(80)),
  title: z.string().transform((v) => normalizeSentences(v).trim()).pipe(z.string().min(1).max(200)),
  instructions: optText(1000),
});

const raw = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"));
const back = (id: string, q = "") => `/notebook/checklists/${id}${q}`;

async function guard() {
  const ctx = await requireContext();
  if (!can(ctx.role, "checklists:write")) redirect("/notebook/checklists");
  return ctx;
}

export async function createTemplate(formData: FormData) {
  const ctx = await guard();
  const p = templateSchema.safeParse(raw(formData));
  if (!p.success) redirect("/notebook/checklists?error=invalid");
  const supabase = await createClient();
  // Becomes the active one only if the service type has none yet (the DB allows one active per type).
  const { data: existing } = await supabase
    .from("checklist_templates").select("id").eq("service_type_id", p.data.service_type_id).eq("is_active", true).limit(1);
  const { data, error } = await supabase
    .from("checklist_templates")
    .insert({ ...p.data, tenant_id: ctx.tenant.id, is_active: !existing?.length })
    .select("id").single();
  if (error || !data) redirect("/notebook/checklists?error=invalid");
  revalidatePath("/notebook/checklists");
  redirect(back(data.id));
}

export async function updateTemplate(id: string, formData: FormData) {
  await guard();
  const p = templateSchema.pick({ name: true, instructions: true }).safeParse(raw(formData));
  if (!p.success) redirect(back(id, "?error=invalid"));
  const supabase = await createClient();
  const { error } = await supabase.from("checklist_templates").update(p.data).eq("id", id);
  revalidatePath("/notebook/checklists");
  redirect(back(id, error ? "?error=invalid" : "?saved=1"));
}

export async function activateTemplate(id: string) {
  await guard();
  const supabase = await createClient();
  await supabase.rpc("activate_checklist_template", { p_id: id });
  revalidatePath("/notebook/checklists");
  redirect(back(id, "?saved=1"));
}

export async function addItem(templateId: string, formData: FormData) {
  const ctx = await guard();
  const p = itemSchema.safeParse(raw(formData));
  if (!p.success) redirect(back(templateId, "?error=invalid"));
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("checklist_template_items").select("position").eq("template_id", templateId).order("position", { ascending: false }).limit(1);
  const { error } = await supabase.from("checklist_template_items").insert({
    ...p.data, tenant_id: ctx.tenant.id, template_id: templateId, position: (last?.[0]?.position ?? 0) + 1,
  });
  revalidatePath(back(templateId));
  redirect(back(templateId, error ? "?error=invalid" : ""));
}

export async function updateItem(templateId: string, itemId: string, formData: FormData) {
  await guard();
  const p = itemSchema.safeParse(raw(formData));
  if (!p.success) redirect(back(templateId, "?error=invalid"));
  const supabase = await createClient();
  const { error } = await supabase.from("checklist_template_items").update(p.data).eq("id", itemId).eq("template_id", templateId);
  revalidatePath(back(templateId));
  redirect(back(templateId, error ? "?error=invalid" : ""));
}

export async function deleteItem(templateId: string, itemId: string) {
  await guard();
  const supabase = await createClient();
  await supabase.from("checklist_template_items").delete().eq("id", itemId).eq("template_id", templateId);
  revalidatePath(back(templateId));
  redirect(back(templateId));
}

/** Move one item up/down in the list; the DB renumbers atomically. */
export async function moveItem(templateId: string, itemId: string, dir: "up" | "down") {
  await guard();
  const t = await getTemplate(templateId);
  if (!t) redirect("/notebook/checklists");
  const ids = t.items.map((i) => i.id);
  const i = ids.indexOf(itemId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i >= 0 && j >= 0 && j < ids.length) {
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const supabase = await createClient();
    await supabase.rpc("reorder_template_items", { p_template: templateId, p_ids: ids });
  }
  revalidatePath(back(templateId));
  redirect(back(templateId));
}
