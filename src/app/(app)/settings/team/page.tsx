import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InviteForm } from "@/components/team/InviteForm";
import { Alert, Button, Card, Select } from "@/components/ui";
import { formatDateOnly } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { getPlanOverview } from "@/modules/billing/queries";
import { revokeInvite, setMemberActive, setMemberRole } from "@/modules/team/actions";
import { INVITE_ROLES, listPendingInvites, listTeam } from "@/modules/team/queries";
import { SavedToast } from "@/components/ui/SavedToast";

export const metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "users:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("team");
  const canEdit = can(ctx.role, "users:write");
  const [team, invites, plan] = await Promise.all([
    listTeam(ctx.tenant.id),
    canEdit ? listPendingInvites(ctx.tenant.id) : Promise.resolve([]),
    getPlanOverview(ctx.tenant.id),
  ]);
  const roles = ctx.role === "owner" ? INVITE_ROLES : INVITE_ROLES.filter((r) => r !== "admin");
  const full = !!plan && plan.maxUsers !== null && plan.users + invites.length >= plan.maxUsers;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </div>
      {sp.error && <Alert>{t(sp.error === "seats" ? "errors.seatsFull" : "errors.saveFailed")}</Alert>}
      {sp.saved && <SavedToast>{t("saved")}</SavedToast>}

      {plan && (
        <p className="text-sm text-muted">
          {plan.maxUsers !== null ? t("seats", { used: plan.users, pending: invites.length, max: plan.maxUsers }) : t("seatsNoLimit", { used: plan.users })}
        </p>
      )}

      {canEdit && (
        <Card accent="blue" className="space-y-3">
          <h2 className="text-base font-semibold">{t("inviteTitle")}</h2>
          {full ? <Alert>{t("errors.seatsFull")}</Alert> : <InviteForm roles={roles} />}
        </Card>
      )}

      {invites.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-base font-semibold">{t("pending")}</h2>
          {invites.map((i) => (
            <Card key={i.id} accent="amber" className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{i.email}</p>
                <p className="text-sm text-muted">
                  {t(`roles.${i.role}`)} · {t("expires", { date: formatDateOnly(i.expires_at.slice(0, 10), ctx.settings.date_format) })}
                </p>
              </div>
              <form action={revokeInvite.bind(null, i.id)}><Button type="submit" variant="secondary">{t("cancelInvite")}</Button></form>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-base font-semibold">{t("members")}</h2>
        {team.map((m) => {
          const self = m.user_id === ctx.userId;
          const locked = !canEdit || self || m.role === "owner" || (m.role === "admin" && ctx.role !== "owner");
          return (
            <Card key={m.id} accent={m.status === "active" ? "teal" : undefined} className={m.status === "active" ? "" : "opacity-70"}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {m.full_name || m.email}
                    {self && <span className="ml-2 text-xs text-muted">({t("you")})</span>}
                  </p>
                  <p className="text-sm text-muted">{m.email}</p>
                </div>
                {locked ? (
                  <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium">
                    {t(`roles.${m.role}`)}{m.status === "disabled" && ` · ${t("inactive")}`}
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={setMemberRole.bind(null, m.id)} className="flex items-center gap-2">
                      <Select name="role" defaultValue={m.role} aria-label={t("role")} className="w-44">
                        {roles.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
                      </Select>
                      <Button type="submit" variant="secondary">{t("saveRole")}</Button>
                    </form>
                    <form action={setMemberActive.bind(null, m.id, m.status !== "active")}>
                      <Button type="submit" variant="secondary">{m.status === "active" ? t("deactivate") : t("reactivate")}</Button>
                    </form>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
