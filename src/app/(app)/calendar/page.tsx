import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, Select, cn } from "@/components/ui";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { addDays, addMonths, isIsoDate, monthGrid, startOfWeek, todayIso, weekDays } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { formatTime } from "@/lib/time";
import { listEmployees } from "@/modules/employees/module";
import { jobsInRange, type CalendarJob } from "@/modules/jobs/queries";

export const metadata = { title: "Calendar" };
type SP = { view?: string; date?: string; employee?: string };

const VIEWS = ["month", "week", "day", "agenda"] as const;
type View = (typeof VIEWS)[number];
const AGENDA_DAYS = 30;

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
  const fmt = ctx.settings.date_format;
  const today = todayIso(ctx.settings.timezone);
  const view: View = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : "month";
  const date = isIsoDate(sp.date) ? sp.date : today;
  const employees = staff ? await listEmployees({ activeOnly: true }) : [];
  const employee = employees.find((e) => e.id === sp.employee)?.id;

  const weeks = view === "month" ? monthGrid(date) : view === "week" ? [weekDays(date)] : [];
  const from = view === "day" ? date : view === "agenda" ? date : weeks[0][0];
  const to = view === "day" ? date : view === "agenda" ? addDays(date, AGENDA_DAYS - 1) : weeks.at(-1)!.at(-1)!;
  const jobs = await jobsInRange(from, to, employee);
  const byDay = new Map<string, CalendarJob[]>();
  for (const j of jobs) byDay.set(j.scheduled_date, [...(byDay.get(j.scheduled_date) ?? []), j]);

  const href = (o: { view?: string; date?: string }) => {
    const p = new URLSearchParams({ view: o.view ?? view, date: o.date ?? date });
    if (employee) p.set("employee", employee);
    return `/calendar?${p.toString()}`;
  };
  const step = { month: () => [addMonths(date, -1), addMonths(date, 1)], week: () => [addDays(startOfWeek(date), -7), addDays(startOfWeek(date), 7)],
    day: () => [addDays(date, -1), addDays(date, 1)], agenda: () => [addDays(date, -AGENDA_DAYS), addDays(date, AGENDA_DAYS)] }[view]();
  const [prev, next] = step;

  const utc = (d: string) => new Date(`${d}T00:00:00Z`);
  const fmtWeekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const fmtLong = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const heading =
    view === "month" ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(utc(date))
    : view === "day" ? fmtLong.format(utc(date))
    : `${formatDateOnly(from, fmt)} – ${formatDateOnly(to, fmt)}`;

  const btn = "inline-flex h-9 items-center rounded-lg border px-3 text-sm";
  const idle = "border-line bg-surface text-fg hover:bg-surface-2";
  const on = "border-primary bg-primary font-medium text-primary-fg hover:bg-primary-hover";
  const month = date.slice(0, 7);

  const jobLine = (j: CalendarJob) => (
    <li key={j.id}>
      <Link href={`/jobs/${j.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line p-3 hover:bg-surface-2">
        <span className="w-32 shrink-0 text-sm font-medium">
          {j.start_time ? `${formatTime(j.start_time)}${j.end_time ? ` – ${formatTime(j.end_time)}` : ""}` : t("allDay")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{j.title}</span>
          <span className="block truncate text-sm text-muted">{j.customer_name}</span>
        </span>
        <JobStatusBadge status={j.status} />
      </Link>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold capitalize tracking-tight">{heading}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href({ date: prev })} className={cn(btn, idle)} aria-label={t("prev")}>‹</Link>
          <Link href={href({ date: today })} className={cn(btn, idle)}>{t("today")}</Link>
          <Link href={href({ date: next })} className={cn(btn, idle)} aria-label={t("next")}>›</Link>
          <span className="mx-1 border-l border-line" />
          {VIEWS.map((v) => (
            <Link key={v} href={href({ view: v })} aria-current={view === v ? "page" : undefined} className={cn(btn, view === v ? on : idle)}>{t(v)}</Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {staff && employees.length > 0 && (
          <form action="/calendar" className="flex items-center gap-2">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="date" value={date} />
            <label htmlFor="employee" className="text-muted">{t("employee")}</label>
            <Select id="employee" name="employee" defaultValue={employee ?? ""} className="h-9 w-48">
              <option value="">{t("everyone")}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </Select>
            <button type="submit" className={cn(btn, idle)}>{t("filter")}</button>
          </form>
        )}
        {staff && <Link href="/jobs/recurring" className="text-primary hover:underline">{t("recurring")}</Link>}
        {!staff && <span className="text-muted">{t("employeeNote")}</span>}
      </div>

      {view === "day" && (
        <Card accent="blue" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{t("jobsCount", { count: jobs.length })}</h2>
            {staff && <Link href={`/jobs/new?date=${date}`} className="text-sm text-primary hover:underline">{t("addJob")}</Link>}
          </div>
          {jobs.length === 0 ? <p className="text-sm text-muted">{t("noJobsDay")}</p> : <ul className="space-y-2">{jobs.map(jobLine)}</ul>}
        </Card>
      )}

      {view === "agenda" && (
        <div className="space-y-4">
          {jobs.length === 0 && <Card className="text-center text-sm text-muted">{t("noJobsAgenda", { days: AGENDA_DAYS })}</Card>}
          {[...byDay.entries()].map(([d, list]) => (
            <Card key={d} accent={d === today ? "green" : "blue"} className="space-y-2">
              <h2 className="flex items-center justify-between text-base font-semibold capitalize">
                <Link href={href({ view: "day", date: d })} className="hover:text-primary">{fmtLong.format(utc(d))}</Link>
                {d === today && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium normal-case text-success">{t("today")}</span>}
              </h2>
              <ul className="space-y-2">{list.map(jobLine)}</ul>
            </Card>
          ))}
        </div>
      )}

      {(view === "month" || view === "week") && (
        <Card accent="blue" className="overflow-x-auto p-0">
          <div className="min-w-[44rem]">
            <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-xs font-medium uppercase text-muted">
              {weeks[0].map((d) => <div key={d} className="p-2">{fmtWeekday.format(utc(d))}</div>)}
            </div>
            {weeks.map((w) => (
              <div key={w[0]} className="grid grid-cols-7 border-b border-line last:border-b-0">
                {w.map((d) => {
                  const list = byDay.get(d) ?? [];
                  const outside = view === "month" && d.slice(0, 7) !== month;
                  return (
                    <div key={d} className={cn("min-h-28 border-r border-line p-1.5 last:border-r-0", view === "week" && "min-h-64", outside && "bg-surface-2/60")}>
                      <div className="flex items-center justify-between">
                        <Link href={href({ view: "day", date: d })} className={cn("flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs hover:underline", d === today ? "bg-primary font-semibold text-primary-fg" : outside ? "text-muted" : "")}>{Number(d.slice(8))}</Link>
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
                          <li><Link href={href({ view: "day", date: d })} className="px-1.5 text-xs text-muted hover:text-primary">{t("more", { count: list.length - 3 })}</Link></li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
