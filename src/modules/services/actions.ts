"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { normalizeName } from "@/lib/text";

const nameSchema = z.string().transform((v) => normalizeName(v).trim()).pipe(z.string().min(1).max(80));

function done(error?: { code?: string } | null) {
  revalidatePath("/settings/services");
  redirect(error ? `/settings/services?error=${error.code === "23505" ? "nameTaken" : "invalid"}` : "/settings/services?saved=1");
}

export async function addServiceType(formData: FormData) {
  const ctx = await requireContext();
  if (!can(ctx.role, "services:write")) redirect("/settings/services");
  const name = nameSchema.safeParse(String(formData.get("name") ?? ""));
  if (!name.success) redirect("/settings/services?error=invalid");
  const supabase = await createClient();
  const { data: last } = await supabase.from("service_types").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const { error } = await supabase.from("service_types").insert({
    tenant_id: ctx.tenant.id, name: name.data, code: "custom", sort_order: (last?.[0]?.sort_order ?? 0) + 1,
  });
  done(error);
}

export async function updateServiceType(id: string, formData: FormData) {
  const ctx = await requireContext();
  if (!can(ctx.role, "services:write")) redirect("/settings/services");
  const patch: { name?: string; is_active?: boolean } = {};
  if (formData.has("name")) {
    const name = nameSchema.safeParse(String(formData.get("name") ?? ""));
    if (!name.success) redirect("/settings/services?error=invalid");
    patch.name = name.data;
  }
  if (formData.has("is_active")) patch.is_active = formData.get("is_active") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("service_types").update(patch).eq("id", id);
  done(error);
}
