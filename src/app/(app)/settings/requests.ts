"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";

/** Turn the public quote-request form on or off for this company. */
export async function setAcceptsRequests(enabled: boolean) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) return;
  const supabase = await createClient();
  // tenant id from the verified membership; RLS also restricts this to owner/admin
  await supabase.from("tenants").update({ accepts_requests: enabled }).eq("id", ctx.tenant.id);
  await supabase.from("audit_log").insert({
    tenant_id: ctx.tenant.id, actor_id: ctx.userId, action: enabled ? "requests.enabled" : "requests.disabled", entity: "tenant", entity_id: ctx.tenant.id,
  });
  revalidatePath("/quotes");
}
