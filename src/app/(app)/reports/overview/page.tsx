import Link from "next/link";
import { reportInPlan } from "@/modules/reports/catalog";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, cn } from "@/components/ui";
import { addDays, addMonths, todayIso } from "@/lib/calendar";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { hoursText } from "@/modules/inventory/schema";
import { listItems } from "@/modules/inventory/queries";

export const metadata = { title: "Business summary" };
type SP = { month?: string; year?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "reports:read")) redirect("/dashboard");
  if (!reportInPlan("overview", ctx.planId)) redirect("/reports");
  const sp = await searchParams;
  const t = await getTranslations("reports");
  const ts = await getTranslations("jobs");
  const cur = ctx.settings.currency;
  const today = todayIso(ctx.settings.timezone);

  const yearMode = /^\d{4}$/.test(sp.year ?? "");
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const from = yearMode ? `${sp.year}-01-01` : `${month}-01`;
  const to = yearMode ? `${sp.year}-12-31` : addDays(addMonths(`${month}-01`, 1), -1);
  const locale = ctx.settings.doc_locale === "es" ? "es-US" : "en-US";
  const label = yearMode ? sp.year! : new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

  const showJobs = can(ctx.role, "jobs:read");
  const showMoney = can(ctx.role, "invoices:read") && can(ctx.role, "expenses:read");
  const showStock = can(ctx.role, "inventory:read");
  const supabase = await createClient();
  const [jobsRes, hoursRes, moneyRes, stock] = await Promise.all([
    showJobs ? supabase.rpc("report_jobs", { p_from: from, p_to: to }) : null,
    showJobs ? supabase.rpc("report_hours", { p_from: from, p_to: to, p_tz: ctx.settings.timezone }) : null,
    showMoney ? supabase.rpc("report_money", { p_from: from, p_to: to }) : null,
    showStock ? listItems() : Promise.resolve([]),
  ]);
  const jobs = ((jobsRes?.data ?? []) as { status: string; jobs: number | string; revenue_cents: number | string }[]).map((r) => ({ status: r.status, jobs: Number(r.jobs), revenue: Number(r.revenue_cents) }));
  const hours = ((hoursRes?.data ?? []) as { employee_id: string; employee_name: string; seconds: number | string; entries: number | string }[]).map((r) => ({ id: r.employee_id, name: r.employee_name, seconds: Number(r.seconds), entries: Number(r.entries) }));
  const m = ((moneyRes?.data ?? []) as { invoiced_cents: number | string; collected_cents: number | string; expenses_cents: number | string }[])[0];
  const invoiced = Number(m?.invoiced_cents ?? 0), collected = Number(m?.collected_cents ?? 0), spent = Number(m?.expenses_cents ?? 0);
  const low = stock.filter((i) => i.is_low);
  const totalJobs = jobs.reduce((s, r) => s + r.jobs, 0);
  const totalHours = hours.reduce((s, r) => s + r.seconds, 0);

  const btn = "inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2";
  const pill = (on: boolean) => cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:bg-surface-2");
  const year = Number((yearMode ? sp.year : month.slice(0, 4)));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-muted hover:text-fg">← {t("backToReports")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("items.overview.title")}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {yearMode ? (
          <>
            <Link href={`/reports/overview?year=${year - 1}`} className={btn} aria-label={t("prev")}>←</Link>
            <p className="min-w-24 text-center font-medium">{label}</p>
            <Link href={`/reports/overview?year=${year + 1}`} className={btn} aria-label={t("next")}>→</Link>
          </>
        ) : (
          <>
            <Link href={`/reports/overview?month=${addMonths(`${month}-01`, -1).slice(0, 7)}`} className={btn} aria-label={t("prev")}>←</Link>
            <p className="min-w-40 text-center font-medium capitalize">{label}</p>
            <Link href={`/reports/overview?month=${addMonths(`${month}-01`, 1).slice(0, 7)}`} className={btn} aria-label={t("next")}>→</Link>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <Link href="/reports/overview" className={pill(!yearMode)}>{t("byMonth")}</Link>
          <Link href={`/reports/overview?year=${year}`} className={pill(yearMode)}>{t("byYear")}</Link>
        </div>
      </div>

      {showMoney && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card accent="blue"><p className="text-sm text-muted">{t("invoiced")}</p><p className="mt-1 text-2xl font-semibold">{formatMoney(invoiced, cur)}</p></Card>
          <Card accent="green"><p className="text-sm text-muted">{t("collected")}</p><p className="mt-1 text-2xl font-semibold">{formatMoney(collected, cur)}</p></Card>
          <Card accent="rose"><p className="text-sm text-muted">{t("expenses")}</p><p className="mt-1 text-2xl font-semibold">{formatMoney(spent, cur)}</p></Card>
          <Card accent="violet"><p className="text-sm text-muted">{t("net")}</p><p className={cn("mt-1 text-2xl font-semibold", collected - spent < 0 && "text-danger")}>{formatMoney(collected - spent, cur)}</p><p className="mt-1 text-xs text-muted">{t("netHelp")}</p></Card>
        </div>
      )}

      {showJobs && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card accent="teal">
            <h2 className="mb-3 text-base font-semibold">{t("jobs")} <span className="font-normal text-muted">({totalJobs})</span></h2>
            {jobs.length === 0 ? <p className="text-sm text-muted">{t("noData")}</p> : (
              <ul className="space-y-1 text-sm">
                {jobs.map((r) => (
                  <li key={r.status} className="flex justify-between gap-3">
                    <span>{ts(`status.${r.status}`)} <span className="text-muted">({r.jobs})</span></span>
                    <span className="font-medium">{formatMoney(r.revenue, cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card accent="amber">
            <h2 className="mb-3 text-base font-semibold">{t("hours")} <span className="font-normal text-muted">({hoursText(totalHours)})</span></h2>
            {hours.length === 0 ? <p className="text-sm text-muted">{t("noData")}</p> : (
              <ul className="space-y-1 text-sm">
                {hours.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span>{r.name} <span className="text-muted">({r.entries})</span></span>
                    <span className="font-medium">{hoursText(r.seconds)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {showStock && (
        <Card accent="rose">
          <h2 className="mb-3 text-base font-semibold">{t("lowStock")} <span className="font-normal text-muted">({low.length})</span></h2>
          {low.length === 0 ? <p className="text-sm text-muted">{t("stockOk")}</p> : (
            <ul className="space-y-1 text-sm">
              {low.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <Link href={`/inventory/${i.id}`} className="text-primary hover:underline">{i.name}</Link>
                  <span>{i.on_hand} / {i.min_quantity} {i.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
