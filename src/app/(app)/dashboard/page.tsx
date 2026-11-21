import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowRight, Banknote, CalendarDays, CheckSquare, CircleDollarSign, ListChecks, PiggyBank,
  Plus, TrendingUp, UserPlus, Users, Wallet, Receipt, Gauge,
} from "lucide-react";
import { BarChart, Donut, LineChart } from "@/components/dashboard/charts";
import { KpiTile, Panel, StatTile, Trend } from "@/components/dashboard/tiles";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { getDashboard, sumByMonth, todayIn } from "@/modules/dashboard/queries";

export const metadata = { title: "Dashboard" };

import { methodName } from "@/modules/payment-methods/labels";
import { listPaymentMethods } from "@/modules/payment-methods/queries";
import { DashboardSearch } from "@/components/customers/DashboardSearch";

const METHOD_COLOR: Record<string, string> = {
  cash: "var(--c-blue)", check: "var(--c-amber)", venmo: "var(--c-teal)", zelle: "var(--c-green)",
  card: "var(--c-rose)", bank_transfer: "var(--c-violet)", other: "var(--fg-muted)",
};

export default async function DashboardPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "dashboard:read")) redirect("/jobs");
  const t = await getTranslations("dashboard");
  const tm = await getTranslations("invoices.method");
  const locale = await getLocale();
  const cur = ctx.settings.currency;
  const tz = ctx.settings.timezone;

  const today = todayIn(tz);
  const money = can(ctx.role, "invoices:read");
  const d = await getDashboard({
    today, money, spend: can(ctx.role, "expenses:read"),
    people: can(ctx.role, "customers:read"), jobs: can(ctx.role, "jobs:read"), tasks: can(ctx.role, "notebook:read"),
  });

  const fmt = (c: number) => formatMoney(c, cur);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date())) % 24;
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = (ctx.profile.full_name || ctx.email).split(" ")[0];
  const dateText = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date());
  const monthShort = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const monthLabel = (m: string) => `${monthShort.format(new Date(`${m}-01T00:00:00Z`))} ${m.slice(2, 4)}`;
  const monthName = (m: string) => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

  const thisM = d.months[d.months.length - 1];
  const payByMonth = d.payments ? sumByMonth(d.payments.map((p) => ({ date: p.paid_on, cents: p.amount_cents })), d.months) : null;
  const expByMonth = d.expenses ? sumByMonth(d.expenses.map((e) => ({ date: e.expense_date, cents: e.amount_cents })), d.months) : null;
  const revMonth = payByMonth?.[payByMonth.length - 1] ?? 0;
  const revPrev = payByMonth?.[payByMonth.length - 2] ?? 0;
  const revYtd = d.payments ? d.payments.filter((p) => p.paid_on.slice(0, 4) === today.slice(0, 4)).reduce((s, p) => s + p.amount_cents, 0) : 0;
  const expMonth = expByMonth?.[expByMonth.length - 1] ?? 0;
  const profit = revMonth - expMonth;

  const methodTotals = new Map<string, number>();
  for (const p of d.payments ?? []) methodTotals.set(p.method, (methodTotals.get(p.method) ?? 0) + p.amount_cents);
  const methodList = await listPaymentMethods();
  const extra = ["var(--c-blue)", "var(--c-amber)", "var(--c-teal)", "var(--c-green)", "var(--c-rose)", "var(--c-violet)"];
  const slices = [...methodTotals.entries()].sort((a, b) => b[1] - a[1]).map(([m, v], i) => ({
    label: methodName(methodList, m, (c) => tm(c as never)), value: v, color: METHOD_COLOR[m] ?? extra[i % extra.length],
  }));
  const methodsTotal = slices.reduce((s, x) => s + x.value, 0);

  const monthLabels = d.months.map(monthLabel);
  const cj = d.completedJobs;
  const avgNow = cj && cj.thisMonth > 0 ? Math.round(revMonth / cj.thisMonth) : 0;
  const avgPrev = cj && cj.lastMonth > 0 ? Math.round(revPrev / cj.lastMonth) : 0;
  const perCustNow = d.customers && d.customers.active > 0 ? Math.round(revMonth / d.customers.active) : 0;
  const hasStats = d.customers || cj || d.payments;

  const quick = [
    can(ctx.role, "customers:write") && { href: "/customers/new", label: t("new.customer") },
    can(ctx.role, "quotes:write") && { href: "/quotes/new", label: t("new.quote") },
    can(ctx.role, "jobs:write") && { href: "/jobs/new", label: t("new.job") },
    can(ctx.role, "invoices:write") && { href: "/invoices/new", label: t("new.invoice") },
    can(ctx.role, "expenses:write") && { href: "/expenses/new", label: t("new.expense") },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-primary bg-surface p-4 sm:gap-4 sm:p-6">
        <div className="min-w-0 max-w-full flex-1">
          <p className="text-sm font-medium text-primary">{t(`greeting.${greeting}`)}</p>
          <h1 className="mt-0.5 text-xl font-extrabold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{firstName}</h1>
          <p className="mt-1 text-sm text-muted">{dateText}</p>
        </div>
        {ctx.trialDaysLeft !== null && (
          <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning">{t("trial", { days: ctx.trialDaysLeft })}</span>
        )}
      </header>

      <div className="flex gap-3">
        {d.customers && (
          <DashboardSearch placeholder={t("search")} label={t("search")} allLabel={t("searchAll")} emptyLabel={t("searchEmpty")} />
        )}
        {quick.length > 0 && (
          <details className="relative">
            <summary className="bp-fx bp-fx-solid flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
              <Plus className="h-4 w-4" aria-hidden /> {t("new.button")}
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-card">
              {quick.map((q) => <Link key={q.href} href={q.href} className="bp-fx-item block rounded-lg px-3 py-2 text-sm hover:bg-primary-soft hover:text-primary">{q.label}</Link>)}
            </div>
          </details>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3" aria-label={t("kpis")}>
        {money && <KpiTile tone="green" icon={TrendingUp} label={t("cards.revenueYtd")} value={fmt(revYtd)} badge={today.slice(0, 4)} />}
        {money && <KpiTile tone="blue" icon={CircleDollarSign} label={t("cards.revenueMonth")} value={fmt(revMonth)} badge={monthName(thisM)} />}
        {d.outstanding && <KpiTile tone="amber" icon={Wallet} label={t("cards.outstanding")} value={fmt(d.outstanding.cents)} badge={t("invoicesCount", { count: d.outstanding.count })} />}
        {d.customers && <KpiTile tone="teal" icon={Users} label={t("cards.customers")} value={String(d.customers.active)} badge={t("activeBadge")} />}
        {d.expenses && <KpiTile tone="red" icon={Banknote} label={t("cards.expenses")} value={fmt(expMonth)} badge={monthName(thisM)} />}
        {money && d.expenses && <KpiTile tone="cyan" icon={PiggyBank} label={t("cards.profit")} value={fmt(profit)} badge={profit >= 0 ? t("profitable") : t("loss")} />}
      </section>

      {hasStats && (
        <section aria-label={t("growth.title")} className="space-y-3">
          <h2 className="text-base font-bold">{t("growth.title")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {d.customers && (
              <StatTile icon={UserPlus} label={t("growth.newCustomers")} value={String(d.customers.newThis)} hint={t("growth.newCustomersHint")}
                trend={<Trend now={d.customers.newThis} before={d.customers.newLast} format={String} suffix={t("growth.vsLast")} />} />
            )}
            {cj && (
              <StatTile icon={CheckSquare} label={t("growth.completedJobs")} value={String(cj.thisMonth)} hint={t("growth.completedJobsHint")}
                trend={<Trend now={cj.thisMonth} before={cj.lastMonth} format={String} suffix={t("growth.vsLast")} />} />
            )}
            {cj && money && (
              <StatTile icon={Gauge} label={t("growth.avgJob")} value={fmt(avgNow)} hint={t("growth.avgJobHint")}
                trend={<Trend now={avgNow} before={avgPrev} format={fmt} suffix={t("growth.vsLast")} />} />
            )}
            {d.customers && money && (
              <StatTile icon={Receipt} label={t("growth.perCustomer")} value={fmt(perCustNow)} hint={t("growth.perCustomerHint")}
                trend={<Trend now={perCustNow} before={d.customers.active > 0 ? Math.round(revPrev / d.customers.active) : 0} format={fmt} suffix={t("growth.vsLast")} />} />
            )}
          </div>
        </section>
      )}

      {payByMonth && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title={t("charts.monthlyRevenue")} className="lg:col-span-2">
            <div className="overflow-x-auto"><BarChart labels={monthLabels} values={payByMonth} valueLabels={payByMonth.map(fmt)} title={t("charts.monthlyRevenue")} /></div>
          </Panel>
          <Panel title={t("charts.byMethod")}>
            {slices.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">{t("charts.noPayments")}</p>
            ) : (
              <>
                <Donut slices={slices} title={t("charts.byMethod")} centerLabel={fmt(methodsTotal)} />
                <ul className="mt-4 space-y-1.5 text-sm">
                  {slices.map((s) => (
                    <li key={s.label} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
                      <span className="text-muted">{Math.round((s.value / methodsTotal) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>
      )}

      {payByMonth && expByMonth && (
        <Panel title={t("charts.revenueVsExpenses")}>
          <div className="overflow-x-auto"><LineChart labels={monthLabels} title={t("charts.revenueVsExpenses")}
            series={[
              { name: t("charts.revenue"), color: "var(--primary)", values: payByMonth, formatted: payByMonth.map(fmt) },
              { name: t("charts.expenses"), color: "var(--danger)", values: expByMonth, formatted: expByMonth.map(fmt) },
            ]} /></div>
          <div className="mt-2 flex justify-center gap-5 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-primary" />{t("charts.revenue")}</span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-danger" />{t("charts.expenses")}</span>
          </div>
        </Panel>
      )}

      {(d.tasks || d.upcoming) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {d.tasks && (
            <Panel title={t("tasks.title")} icon={ListChecks} action={<Link href="/notebook/tasks" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">{t("viewAll")} <ArrowRight className="h-4 w-4" aria-hidden /></Link>}>
              {d.tasks.length === 0 ? <p className="py-8 text-center text-sm text-muted">{t("tasks.empty")}</p> : (
                <ul className="divide-y divide-line">
                  {d.tasks.map((k) => (
                    <li key={k.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="truncate font-medium">{k.title}</span>
                      {k.due_date && <span className={`shrink-0 text-xs ${k.due_date < today ? "text-danger" : "text-muted"}`}>{formatDateOnly(k.due_date, ctx.settings.date_format)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          {d.upcoming && (
            <Panel title={t("upcoming.title")} icon={CalendarDays} action={<Link href="/jobs" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">{t("viewAll")} <ArrowRight className="h-4 w-4" aria-hidden /></Link>}>
              {d.upcoming.length === 0 ? <p className="py-8 text-center text-sm text-muted">{t("upcoming.empty")}</p> : (
                <ul className="divide-y divide-line">
                  {d.upcoming.map((j) => (
                    <li key={j.id}>
                      <Link href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary">
                        <span className="min-w-0"><span className="block truncate font-medium">{j.title}</span><span className="block truncate text-xs text-muted">{j.customer_name}</span></span>
                        <span className="shrink-0 text-xs text-muted">{formatDateOnly(j.scheduled_date, ctx.settings.date_format)}{j.start_time ? ` · ${j.start_time.slice(0, 5)}` : ""}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
