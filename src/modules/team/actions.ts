"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { isValidEmail } from "@/lib/email";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { INVITE_ROLES } from "./queries";

const BACK = "/settings/team";
import { INVITE_COOKIE } from "./constants";

/** `error` is a key under the "team" messages; `link` is the invitation link, shown once. */
export type InviteState = { error?: string; link?: string; email?: string } | undefined;

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().refine(isValidEmail),
  role: z.enum(INVITE_ROLES),
});

async function guard() {
  const ctx = await requireContext();
  if (!can(ctx.role, "users:write")) redirect("/dashboard");
  return ctx;
}

export async function inviteMember(_: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await guard();
  const p = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!p.success) return { error: "invalidInvite" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation", { p_tenant: ctx.tenant.id, p_email: p.data.email, p_role: p.data.role });
  if (error || typeof data !== "string") {
    if (error?.message.includes("limit")) return { error: "seatsFull" };
    if (error?.message.includes("already a member")) return { error: "alreadyMember" };
    if (error?.message.includes("administrators")) return { error: "ownerOnlyAdmin" };
    return { error: "inviteFailed" };
  }
  revalidatePath(BACK);
  return { link: `${publicEnv().NEXT_PUBLIC_APP_URL}/invite/${data}`, email: p.data.email };
}

export async function revokeInvite(id: string) {
  await guard();
  const supabase = await createClient();
  await supabase.rpc("revoke_invitation", { p_id: id });
  revalidatePath(BACK);
  redirect(BACK);
}

export async function setMemberRole(id: string, formData: FormData) {
  await guard();
  const role = z.enum(INVITE_ROLES).safeParse(formData.get("role"));
  if (!role.success) redirect(`${BACK}?error=1`);
  const supabase = await createClient();
  const { error } = await supabase.from("memberships").update({ role: role.data }).eq("id", id);
  revalidatePath(BACK);
  redirect(error ? `${BACK}?error=1` : `${BACK}?saved=1`);
}

export async function setMemberActive(id: string, active: boolean) {
  await guard();
  const supabase = await createClient();
  const { error } = await supabase.from("memberships").update({ status: active ? "active" : "disabled" }).eq("id", id);
  revalidatePath(BACK);
  redirect(error ? `${BACK}?error=${error.message.includes("limit") ? "seats" : "1"}` : `${BACK}?saved=1`);
}

/** Accepts the invitation whose token is in the cookie set by /invite/[token]. */
export async function acceptInvite() {
  const store = await cookies();
  const token = store.get(INVITE_COOKIE)?.value;
  if (!token) redirect("/invite/accept?error=1");
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) redirect("/login");
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) redirect(`/invite/accept?error=${error.message.includes("another company") ? "other" : error.message.includes("limit") ? "seats" : "1"}`);
  store.delete(INVITE_COOKIE);
  redirect("/dashboard");
}
