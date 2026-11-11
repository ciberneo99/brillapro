import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, Star } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, cn } from "@/components/ui";
import { addMonths, todayIso } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { toggleFavorite } from "@/modules/reports/actions";
import { reportByKey } from "@/modules/reports/catalog";
import { buildRunCtx } from "@/modules/reports/context";
import { parsePeriod, periodQuery, type PeriodParams } from "@/modules/reports/period";
import { listFavorites } from "@/modules/reports/queries";
import { runReport, type Cell, type Col } from "@/modules/reports/run";

export const metadata = { title: "Report" };

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<PeriodParams> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "reports:read")) redirect("/dashboard");
  const { key } = await params;
  const def = reportByKey(key);
  if (!def || def.href || def.unavailable || !def.needs.every((p) => can(ctx.role, p))) notFound();
  const sp = await searchParams;
  const t = await getTranslations("reports");
  const today = todayIso(ctx.settings.timezone);
  const period = parsePeriod(sp, today);
  const result = await runReport(key, await buildRunCtx(ctx, period));
  if (!result) notFound();
  const favorite = (await listFavorites(ctx.tenant.id, ctx.userId)).has(key);
  const cur = ctx.settings.currency;
  const fmt = ctx.settings.date_format;
  const locale = ctx.settings.doc_locale === "es" ? "es-US" : "en-US";
  const label = period.mode === "year" ? String(period.year)
    : period.mode === "custom" ? `${formatDateOnly(period.from, fmt)} – ${formatDateOnly(period.to, fmt)}`
    : new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period.month}-01T00:00:00Z`));

  const show = (col: Col, v: Cell) => {
    if (v === null || v === undefined || v === "") return "";
    if (col.kind === "money") return formatMoney(Number(v), cur);
    if (col.kind === "date") return formatDateOnly(String(v), fmt);
    if (col.kind === "pct") return `${v}%`;
    return String(v);
  };
  const right = (c: Col) => c.kind === "money" || c.kind === "int" || c.kind === "pct";
  const btn = "inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2";
  const pill = (on: boolean) => cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:bg-surface-2");
  const base = `/reports/${key}`;
  const csv = `${base}/csv${def.ranged ? `?${periodQuery(period)}` : ""}`;
  const title = t(`items.${key}.title`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-muted hover:text-fg">← {t("backToReports")}</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t(`items.${key}.desc`)}</p>
        </div>
        <div className="flex gap-2">
          <form action={toggleFavorite.bind(null, key)}>
            <button type="submit" aria-pressed={favorite} className={btn}>
              <Star className={cn("mr-2 h-4 w-4", favorite && "fill-amber-400 text-amber-400")} aria-hidden />{t(favorite ? "starred" : "starAction")}
            </button>
          </form>
          {def.csv && <a href={csv} className={btn}><Download className="mr-2 h-4 w-4" aria-hidden />{t("csv")}</a>}
        </div>
      </div>

      {def.ranged ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {period.mode === "year" ? (
              <>
                <Link href={`${base}?year=${period.year - 1}`} className={btn} aria-label={t("prev")}>←</Link>
                <p className="min-w-24 text-center font-medium">{label}</p>
                <Link href={`${base}?year=${period.year + 1}`} className={btn} aria-label={t("next")}>→</Link>
              </>
            ) : period.mode === "month" ? (
              <>
                <Link href={`${base}?month=${addMonths(`${period.month}-01`, -1).slice(0, 7)}`} className={btn} aria-label={t("prev")}>←</Link>
                <p className="min-w-40 text-center font-medium capitalize">{label}</p>
                <Link href={`${base}?month=${addMonths(`${period.month}-01`, 1).slice(0, 7)}`} className={btn} aria-label={t("next")}>→</Link>
              </>
            ) : <p className="font-medium">{label}</p>}
            <div className="ml-auto flex gap-2">
              <Link href={base} className={pill(period.mode === "month")}>{t("byMonth")}</Link>
              <Link href={`${base}?year=${period.year}`} className={pill(period.mode === "year")}>{t("byYear")}</Link>
            </div>
          </div>
          <form method="get" action={base} className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1"><span className="block text-xs text-muted">{t("from")}</span><input type="date" name="from" required defaultValue={period.from} className="h-10 rounded-lg border border-line bg-surface px-3" /></label>
            <label className="space-y-1"><span className="block text-xs text-muted">{t("to")}</span><input type="date" name="to" required defaultValue={period.to} className="h-10 rounded-lg border border-line bg-surface px-3" /></label>
            <button type="submit" className={btn}>{t("applyRange")}</button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-muted">{t("asOf", { date: formatDateOnly(today, fmt) })}</p>
      )}

      {result.summary && result.summary.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {result.summary.map((s) => (
            <li key={s.label} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"><span className="text-muted">{s.label}</span> <strong className="ml-1">{formatMoney(s.cents, cur)}</strong></li>
          ))}
        </ul>
      )}

      <Card>
        {result.rows.length === 0 ? (
          <p className="text-sm text-muted">{t("noData")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  {result.cols.map((c) => <th key={c.key} scope="col" className={cn("px-2 py-2 font-medium", right(c) ? "text-right" : "text-left")}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.rows.map((r, i) => (
                  <tr key={i} className={cn(r._bold && "bg-surface-2 font-semibold")}>
                    {result.cols.map((c) => <td key={c.key} className={cn("px-2 py-2", right(c) ? "text-right tabular-nums" : "text-left")}>{show(c, r[c.key])}</td>)}
                  </tr>
                ))}
              </tbody>
              {result.totals && (
                <tfoot>
                  <tr className="border-t-2 border-line font-semibold">
                    {result.cols.map((c) => <td key={c.key} className={cn("px-2 py-2", right(c) ? "text-right tabular-nums" : "text-left")}>{show(c, result.totals![c.key] ?? null)}</td>)}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
