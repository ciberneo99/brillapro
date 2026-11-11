import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowDownUp, ArrowLeft, Download, Eye, FileText, Star } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/components/ui";
import { RefreshButton, ReportFilters } from "@/components/reports/ReportControls";
import { todayIso } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { toggleFavorite } from "@/modules/reports/actions";
import { reportByKey } from "@/modules/reports/catalog";
import { buildRunCtx, periodLabel } from "@/modules/reports/context";
import { formatCell, isRight, sortByDate } from "@/modules/reports/format";
import { parsePeriod, periodQuery, type PeriodParams } from "@/modules/reports/period";
import { listFavorites } from "@/modules/reports/queries";
import { PAYMENT_METHODS, runReport, type Col, type Row, type Tone } from "@/modules/reports/run";

export const metadata = { title: "Report" };

type SP = PeriodParams & { method?: string; sort?: string };
const TONE: Record<Tone, string> = { default: "text-fg", green: "text-success", accent: "text-primary", danger: "text-danger" };

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "reports:read")) redirect("/dashboard");
  const { key } = await params;
  const def = reportByKey(key);
  if (!def || def.href || def.unavailable || !def.needs.every((p) => can(ctx.role, p))) notFound();
  const sp = await searchParams;
  const t = await getTranslations("reports");
  const ti = await getTranslations("invoices");
  const today = todayIso(ctx.settings.timezone);
  const period = parsePeriod(sp, today, "all");
  const method = key === "payments_collected" && PAYMENT_METHODS.includes(sp.method ?? "") ? sp.method : undefined;
  const sort = sp.sort === "asc" ? "asc" : "desc";
  const result = sortByDate((await runReport(key, await buildRunCtx(ctx, period, method))) ?? notFound(), sort);
  const favorite = (await listFavorites(ctx.tenant.id, ctx.userId)).has(key);
  const cur = ctx.settings.currency;
  const fmt = ctx.settings.date_format;
  const label = await periodLabel(ctx, period);

  const base = `/reports/${key}`;
  const q = [def.ranged ? periodQuery(period) : "", method ? `method=${method}` : ""].filter(Boolean).join("&");
  const withQ = (path: string, extra = "") => `${path}${[q, extra].filter(Boolean).length ? `?${[q, extra].filter(Boolean).join("&")}` : ""}`;
  const ghost = "inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2";
  const primary = "inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90";
  const title = t(`items.${key}.title`);
  const sortLink = withQ(base, `sort=${sort === "desc" ? "asc" : "desc"}`);
  const hasDate = result.cols.some((c) => c.kind === "date");

  const cell = (c: Col, r: Row) => {
    const text = formatCell(c, r[c.key] ?? null, cur, fmt);
    const body = c.link && r._href && text ? <Link href={r._href} className="text-primary hover:underline">{text}</Link> : text;
    return <td key={c.key} className={cn("px-3 py-3", isRight(c) ? "text-right tabular-nums" : "text-left", c.positive && "font-medium text-success", c.kind === "money" && c.key === "amount" && "whitespace-nowrap")}>{body}</td>;
  };
  const head = (
    <tr className="border-b border-line text-sm text-muted">
      {result.cols.map((c) => (
        <th key={c.key} scope="col" className={cn("px-3 py-3 font-semibold", isRight(c) ? "text-right" : "text-left")}>
          {c.kind === "date" && hasDate ? (
            <Link href={sortLink} className="inline-flex items-center gap-1 hover:text-fg" aria-label={t("sortByDate")}>{c.label}<ArrowDownUp className="h-3.5 w-3.5 text-primary" aria-hidden /></Link>
          ) : c.label}
        </th>
      ))}
    </tr>
  );
  const moneyCol = result.cols.findIndex((c) => c.positive || c.kind === "money");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <Link href="/reports" className={ghost}><ArrowLeft className="mr-2 h-4 w-4" aria-hidden />{t("back")}</Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted">{t(`items.${key}.subtitle`)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={toggleFavorite.bind(null, key)}>
            <button type="submit" aria-pressed={favorite} className={ghost} title={t(favorite ? "starred" : "starAction")}>
              <Star className={cn("h-4 w-4", favorite && "fill-amber-400 text-amber-400")} aria-hidden /><span className="sr-only">{t(favorite ? "starred" : "starAction")}</span>
            </button>
          </form>
          <RefreshButton className={ghost} />
          <a href={withQ(`${base}/csv`)} className={ghost}><Download className="mr-2 h-4 w-4" aria-hidden />{t("exportCsv")}</a>
          <a href={withQ(`${base}/pdf`)} target="_blank" rel="noopener" className={ghost}><Eye className="mr-2 h-4 w-4" aria-hidden />{t("previewPdf")}</a>
          <a href={withQ(`${base}/pdf`, "download=1")} className={primary}><FileText className="mr-2 h-4 w-4" aria-hidden />{t("downloadPdf")}</a>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="space-y-1 bg-surface-2 px-6 py-8 text-center">
          <p className="text-xl font-semibold">{ctx.tenant.name}</p>
          <p className="text-lg font-semibold uppercase tracking-widest">{title}</p>
          <p className="font-medium uppercase tracking-wide">{def.ranged ? label : t("asOf", { date: formatDateOnly(today, fmt) })}</p>
        </div>

        <div className="border-t border-line px-6 py-4">
          <ReportFilters
            base={base} range={period.range} from={period.from} to={period.to} noRange={!def.ranged}
            method={method} methods={key === "payments_collected" ? PAYMENT_METHODS.map((m) => ({ id: m, label: ti(`method.${m}`) })) : undefined}
          />
        </div>

        <dl className="grid divide-y divide-line border-t border-line md:grid-cols-3 md:divide-x md:divide-y-0">
          {result.stats.map((s) => (
            <div key={s.label} className="px-6 py-5">
              <dt className="text-sm text-muted">{s.label}</dt>
              <dd className={cn("mt-1 text-3xl font-semibold tabular-nums", TONE[s.tone])}>{s.kind === "money" ? formatCell({ key: "", label: "", kind: "money" }, s.value, cur, fmt) : s.value.toLocaleString("en-US")}</dd>
              <p className={cn("mt-1 text-sm", s.tone === "default" ? "text-primary" : TONE[s.tone])}>{s.hint}</p>
            </div>
          ))}
        </dl>

        {result.breakdown && result.breakdown.rows.length > 0 && (
          <div className="border-t border-line px-6 py-5">
            <h2 className="text-base font-semibold">{result.breakdown.title}</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[24rem] text-sm">
                <thead><tr className="border-b border-line text-xs text-muted">{result.breakdown.cols.map((c) => <th key={c.key} scope="col" className={cn("px-3 py-2 font-semibold", isRight(c) ? "text-right" : "text-left")}>{c.label}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {result.breakdown.rows.map((r, i) => <tr key={i}>{result.breakdown!.cols.map((c) => <td key={c.key} className={cn("px-3 py-2", isRight(c) ? "text-right tabular-nums" : "text-left font-medium")}>{formatCell(c, r[c.key] ?? null, cur, fmt)}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="border-t border-line px-6 py-6">
          <h2 className="text-xl font-semibold">{result.tableTitle}</h2>
          <p className="text-sm text-muted">{t("inThisPeriod")}</p>
          {result.rows.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t("noData")}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>{head}</thead>
                {result.groups ? result.groups.map((g) => (
                  <tbody key={g.label}>
                    <tr className="bg-surface-2">
                      <td colSpan={Math.max(moneyCol, 1)} className="px-3 py-3 font-semibold uppercase">{g.label} <span className="ml-1 font-normal normal-case text-muted">({t("transactionsCount", { count: g.count })})</span></td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-success">{formatCell({ key: "", label: "", kind: "money" }, g.totalCents, cur, fmt)}</td>
                      <td colSpan={result.cols.length - moneyCol - 1} />
                    </tr>
                    {g.rows.map((r, i) => <tr key={i} className={cn(i % 2 === 1 && "bg-surface-2/60")}>{result.cols.map((c) => cell(c, r))}</tr>)}
                  </tbody>
                )) : (
                  <tbody>
                    {result.rows.map((r, i) => <tr key={i} className={cn(i % 2 === 1 && "bg-surface-2/60", r._bold && "bg-surface-2 font-semibold")}>{result.cols.map((c) => cell(c, r))}</tr>)}
                  </tbody>
                )}
                {result.totals && !result.groups && (
                  <tfoot><tr className="border-t-2 border-line font-semibold">{result.cols.map((c) => cell(c, result.totals!))}</tr></tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
