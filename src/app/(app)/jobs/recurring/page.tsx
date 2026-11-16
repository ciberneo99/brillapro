import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card } from "@/components/ui";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { formatTime } from "@/lib/time";
import { ConfirmSubmit } from "@/components/bank/ConfirmSubmit";
import { Plus, Trash2 } from "lucide-react";
import { deleteSeries, endSchedule, extendSchedule } from "@/modules/recurring/actions";
import { listSchedules } from "@/modules/recurring/module";

export const metadata = { title: "Recurring jobs" };
type SP = { error?: string; created?: string; ended?: string; removed?: string; cancelled?: string };

export default async function RecurringPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "jobs:write")) redirect("/jobs");
  const sp = await searchParams;
  const t = await getTranslations("recurring");
  const tj = await getTranslations("jobs");
  const fmt = ctx.settings.date_format;
  const schedules = await listSchedules();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/jobs" className="text-sm text-muted hover:text-fg">← {tj("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </div>
      <div>
        <Link href="/jobs/new" className="bp-fx bp-fx-solid inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"><Plus className="h-4 w-4" aria-hidden />{tj("new")}</Link>
      </div>
      {sp.error && <Alert>{t("invalid")}</Alert>}
      {sp.created !== undefined && <Alert tone="success">{t("createdJobs", { count: Number(sp.created) })}</Alert>}
      {sp.removed !== undefined && (
        <Alert tone="success">{tj("delete.result", { count: Number(sp.removed) || 0 })}{Number(sp.cancelled) > 0 && ` ${tj("delete.kept", { count: Number(sp.cancelled) })}`}</Alert>
      )}
      {sp.ended !== undefined && <Alert tone="success">{t("ended", { count: Number(sp.ended) })}</Alert>}

      {schedules.length === 0 && <Card className="text-center text-sm text-muted">{t("empty")}</Card>}
      {schedules.map((s) => (
        <Card key={s.id} accent={s.is_active ? "violet" : undefined} className={s.is_active ? "space-y-2" : "space-y-2 opacity-70"}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">{s.title} <span className="font-normal text-muted">· {s.customerName}</span></h2>
              <p className="text-sm text-muted">
                {t(`frequency.${s.frequency}`)} · {t("from")} {formatDateOnly(s.start_date, fmt)}
                {s.until_date ? ` ${t("until")} ${formatDateOnly(s.until_date, fmt)}` : ""}
                {s.start_time ? ` · ${formatTime(s.start_time)}` : ""} · {formatMoney(s.price_cents, ctx.settings.currency)}
              </p>
              <p className="text-xs text-muted">
                {s.employees.length ? s.employees.join(", ") : t("noTeam")}
                {s.generated_until ? ` · ${t("generatedUntil", { date: formatDateOnly(s.generated_until, fmt) })}` : ""}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs ${s.is_active ? "bg-success-soft text-success" : "bg-surface-2 text-muted"}`}>{s.is_active ? t("active") : t("ended_label")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
          {s.is_active && (
            <>
              <form action={extendSchedule.bind(null, s.id)}><Button type="submit" variant="secondary">{t("extend")}</Button></form>
              <form action={endSchedule.bind(null, s.id, false)}><Button type="submit" variant="ghost">{t("end")}</Button></form>
              <form action={endSchedule.bind(null, s.id, true)}><Button type="submit" variant="ghost" className="text-danger">{t("endCancel")}</Button></form>
            </>
          )}
            <form action={deleteSeries.bind(null, s.id)}><ConfirmSubmit message={tj("delete.confirmSeries")} className="bp-fx bp-fx-danger bp-fx-nobar inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-danger hover:border-danger hover:bg-danger-soft"><Trash2 className="h-4 w-4" aria-hidden />{tj("delete.series")}</ConfirmSubmit></form>
          </div>
        </Card>
      ))}

    </div>
  );
}
