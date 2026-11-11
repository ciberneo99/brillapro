"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { reportByKey } from "./catalog";

/** Stars or un-stars a report for the signed-in person. Favorites are private to them. */
export async function toggleFavorite(key: string): Promise<void> {
  const ctx = await requireContext();
  if (!reportByKey(key)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("report_favorites").select("report_key").eq("report_key", key).eq("user_id", ctx.userId).eq("tenant_id", ctx.tenant.id).maybeSingle();
  if (data) await supabase.from("report_favorites").delete().eq("report_key", key).eq("user_id", ctx.userId).eq("tenant_id", ctx.tenant.id);
  else await supabase.from("report_favorites").insert({ tenant_id: ctx.tenant.id, user_id: ctx.userId, report_key: key });
  revalidatePath("/reports");
}
