import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, cn } from "@/components/ui";
import { addDays, addMonths, isIsoDate, monthGrid, startOfWeek, todayIso, weekDays } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { formatTime } from "@/lib/time";
import { listEmployees } from "@/modules/employees/module";
import { jobsInRange, type CalendarJob } from "@/modules/jobs/queries";

export const metadata = { title: "Calendar" };
type SP = { view?: string; date?: string; employee?: string };

const TONE: Record<string, string> = {
  scheduled: "bg-primary-soft text-primary",
  in_progress: "bg-warning-soft text-warning",
  completed: "bg-success-soft text-success",
  cancelled: "bg-surface-2 text-muted line-through",
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "calendar:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("calendar");
  const locale = await getLocale();
  const staff = can(ctx.role, "jobs:write");
  const today = todayIso(ctx.settings.timezone);
  const view = sp.view === "week" ? "week" : "month";
  const date = isIsoDate(sp.date) ? sp.date : today;
  const employees = staff ? await listEmployees({ activeOnly: true }) : [];
  const employee = employees.find((e) => e.id === sp.employee)?.id;

  const weeks = view === "month" ? monthGrid(date) : [weekDays(date)];
  const from = weeks[0][0];
  const to = weeks.at(-1)!.at(-1)!;
  const jobs = await jobsInRange(from, to, employee);
  const byDay = new Map<string, CalendarJob[]>();
  for (const j of jobs) byDay.set(j.scheduled_date, [...(byDay.get(j.scheduled_date) ?? []), j]);

  const href = (o: { view?: string; date?: string }) => {
    const p = new URLSearchParams({ view: o.view ?? view, date: o.date ?? date });
    if (employee) p.set("employee", employee);
    return `/calendar?${p.toString()}`;
  };
  const prev = view === "month" ? addMonths(date, -1) : addDays(startOfWeek(date), -7);
  const next = view === "month" ? addMonths(date, 1) : addDays(startOfWeek(date), 7);
  const fmtDay = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const heading = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const weekHeading = `${formatDateOnly(from, ctx.settings.date_format)} – ${formatDateOnly(to, ctx.settings.date_format)}`;
  const btn = "inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2";
  const month = date.slice(0, 7);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold capitalize tracking-tight">{view === "month" ? heading : weekHeading}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href({ date: prev })} className={btn} aria-label={t("prev")}>‹</Link>
          <Link href={href({ date: today })} className={btn}>{t("today")}</Link>
          <Link href={href({ date: next })} className={btn} aria-label={t("next")}>›</Link>
          <span className="mx-1 border-l border-line" />
          <Link href={href({ view: "month" })} className={cn(btn, view === "month" && "border-primary bg-primary text-primary-fg hover:bg-primary-hover")}>{t("month")}</Link>
          <Link href={href({ view: "week" })} className={cn(btn, view === "week" && "border-primary bg-primary text-primary-fg hover:bg-primary-hover")}>{t("week")}</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {staff && employees.length > 0 && (
          <form action="/calendar" className="flex items-center gap-2">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="date" value={date} />
            <label htmlFor="employee" className="text-muted">{t("employee")}</label>
            <select id="employee" name="employee" defaultValue={employee ?? ""} className="h-9 rounded-lg border border-line bg-surface px-2">
              <option value="">{t("everyone")}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
            <button type="submit" className={btn}>{t("filter")}</button>
          </form>
        )}
        {staff && <Link href="/jobs/recurring" className="text-primary hover:underline">{t("recurring")}</Link>}
        {!staff && <span className="text-muted">{t("employeeNote")}</span>}
      </div>

      <Card accent="blue" className="overflow-x-auto p-0">
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-xs font-medium uppercase text-muted">
            {weeks[0].map((d) => <div key={d} className="p-2">{fmtDay.format(new Date(`${d}T00:00:00Z`))}</div>)}
          </div>
          {weeks.map((w) => (
            <div key={w[0]} className="grid grid-cols-7 border-b border-line last:border-b-0">
              {w.map((d) => {
                const list = byDay.get(d) ?? [];
                const outside = view === "month" && d.slice(0, 7) !== month;
                return (
                  <div key={d} className={cn("min-h-28 border-r border-line p-1.5 last:border-r-0", view === "week" && "min-h-64", outside && "bg-surface-2/60")}>
                    <div className="flex items-center justify-between">
                      <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs", d === today ? "bg-primary font-semibold text-primary-fg" : outside ? "text-muted" : "")}>{Number(d.slice(8))}</span>
                      {staff && <Link href={`/jobs/new?date=${d}`} className="text-xs text-muted hover:text-primary" aria-label={t("addJob")}>+</Link>}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {list.slice(0, view === "month" ? 3 : 50).map((j) => (
                        <li key={j.id}>
                          <Link href={`/jobs/${j.id}`} className={cn("block truncate rounded px-1.5 py-0.5 text-xs", TONE[j.status] ?? TONE.scheduled)} title={`${j.title} · ${j.customer_name}`}>
                            {j.start_time && <strong>{formatTime(j.start_time)} </strong>}{j.title}
                          </Link>
                        </li>
                      ))}
                      {view === "month" && list.length > 3 && (
                        <li><Link href={href({ view: "week", date: d })} className="px-1.5 text-xs text-muted hover:text-primary">{t("more", { count: list.length - 3 })}</Link></li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
