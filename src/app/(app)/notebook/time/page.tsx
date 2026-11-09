import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Input, Select, cn } from "@/components/ui";
import { DatePicker } from "@/components/ui/DatePicker";
import { addDays, isIsoDate, startOfWeek, todayIso } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { formatClock, formatDuration } from "@/lib/time";
import { listEmployees } from "@/modules/employees/module";
import { addTimeEntry, clockIn, clockOut, deleteTimeEntry } from "@/modules/notebook/actions";
import { listTimeEntries, myEmployee, myOpenJobs, openEntry } from "@/modules/notebook/queries";

export const metadata = { title: "Time tracking" };
const currentMs = () => Date.now();
type SP = { date?: string; employee?: string; error?: string; saved?: string };

export default async function TimePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "notebook:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("time");
  const tz = ctx.settings.timezone;
  const fmt = ctx.settings.date_format;
  const today = todayIso(tz);
  const date = isIsoDate(sp.date) ? sp.date : today;
  const from = startOfWeek(date);
  const to = addDays(from, 6);
  const manager = can(ctx.role, "employees:write");
  const seesAll = can(ctx.role, "employees:read");

  const me = await myEmployee(ctx.tenant.id, ctx.userId);
  const [open, jobs, all, entriesRaw] = await Promise.all([
    me ? openEntry(me.id) : null,
    me ? myOpenJobs(me.id) : [],
    seesAll ? listEmployees({ activeOnly: true }) : [],
    listTimeEntries(`${addDays(from, -1)}T00:00:00Z`, `${addDays(to, 2)}T00:00:00Z`, seesAll ? sp.employee : undefined),
  ]);
  const localDay = (ts: string) => todayIso(tz, new Date(ts));
  const entries = entriesRaw.filter((e) => localDay(e.clock_in) >= from && localDay(e.clock_in) <= to);
  const nowMs = currentMs();
  const dur = (e: { clock_in: string; clock_out: string | null }) => (e.clock_out ? new Date(e.clock_out).getTime() : nowMs) - new Date(e.clock_in).getTime();
  const totals = new Map<string, number>();
  for (const e of entries) if (e.clock_out) totals.set(e.employeeName || t("you"), (totals.get(e.employeeName || t("you")) ?? 0) + dur(e));
  const grand = [...totals.values()].reduce((a, b) => a + b, 0);

  const href = (d: string) => `/notebook/time?date=${d}${sp.employee ? `&employee=${sp.employee}` : ""}`;
  const btn = "inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm text-fg hover:bg-surface-2";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/notebook" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </div>
      {sp.error && <Alert>{t(sp.error === "clock" ? "clockError" : "invalid")}</Alert>}
      {sp.saved && <Alert tone="success">{t("saved")}</Alert>}

      {me ? (
        <Card accent={open ? "green" : "blue"} className="space-y-3">
          {open ? (
            <>
              <p className="text-base font-semibold">{t("clockedInSince", { time: formatClock(open.clock_in, tz) })}{open.jobTitle ? ` · ${open.jobTitle}` : ""}</p>
              <form action={clockOut}><Button type="submit" variant="danger">{t("clockOut")}</Button></form>
            </>
          ) : (
            <form action={clockIn} className="flex flex-wrap items-end gap-3">
              <Field label={t("job")} htmlFor="job_id">
                <Select id="job_id" name="job_id" defaultValue="">
                  <option value="">{t("noJob")}</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{formatDateOnly(j.scheduled_date, fmt)} · {j.title}</option>)}
                </Select>
              </Field>
              <Button type="submit">{t("clockIn")}</Button>
            </form>
          )}
        </Card>
      ) : (
        <p className="text-sm text-muted">{t("noEmployeeRecord")}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{formatDateOnly(from, fmt)} – {formatDateOnly(to, fmt)}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href(addDays(from, -7))} className={btn} aria-label={t("prev")}>‹</Link>
          <Link href={href(today)} className={btn}>{t("thisWeek")}</Link>
          <Link href={href(addDays(from, 7))} className={btn} aria-label={t("next")}>›</Link>
          {seesAll && all.length > 0 && (
            <form action="/notebook/time" className="flex items-center gap-2">
              <input type="hidden" name="date" value={date} />
              <select name="employee" defaultValue={sp.employee ?? ""} aria-label={t("employee")} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm">
                <option value="">{t("everyone")}</option>
                {all.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
              <button type="submit" className={btn}>{t("filter")}</button>
            </form>
          )}
        </div>
      </div>

      {totals.size > 0 && (
        <Card accent="teal">
          <h3 className="mb-2 text-sm font-semibold">{t("totals")}</h3>
          <ul className="space-y-1 text-sm">
            {[...totals.entries()].map(([name, ms]) => <li key={name} className="flex justify-between"><span>{name}</span><strong>{formatDuration(ms)}</strong></li>)}
            {totals.size > 1 && <li className="flex justify-between border-t border-line pt-1"><span>{t("all")}</span><strong>{formatDuration(grand)}</strong></li>}
          </ul>
        </Card>
      )}

      {entries.length === 0 ? (
        <Card className="text-center text-sm text-muted">{t("empty")}</Card>
      ) : (
        <Card accent="blue" className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase text-muted">
              <tr><th className="p-3">{t("date")}</th>{seesAll && <th className="p-3">{t("employee")}</th>}<th className="p-3">{t("job")}</th><th className="p-3">{t("hours")}</th><th className="p-3 text-right">{t("duration")}</th>{manager && <th className="p-3" />}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap p-3">{formatDateOnly(localDay(e.clock_in), fmt)}</td>
                  {seesAll && <td className="p-3">{e.employeeName}</td>}
                  <td className="p-3 text-muted">{e.jobTitle ?? "—"}{e.notes ? ` · ${e.notes}` : ""}</td>
                  <td className="whitespace-nowrap p-3">{formatClock(e.clock_in, tz)} – {e.clock_out ? formatClock(e.clock_out, tz) : <span className="text-success">{t("running")}</span>}</td>
                  <td className={cn("whitespace-nowrap p-3 text-right font-medium", !e.clock_out && "text-success")}>{formatDuration(dur(e))}</td>
                  {manager && <td className="p-3 text-right"><form action={deleteTimeEntry.bind(null, e.id)}><button type="submit" className="text-xs text-danger hover:underline">{t("delete")}</button></form></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {manager && all.length > 0 && (
        <Card accent="green">
          <h2 className="mb-3 text-base font-semibold">{t("addEntry")}</h2>
          <form action={addTimeEntry} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("employee")} htmlFor="employee_id">
              <Select id="employee_id" name="employee_id" required defaultValue="">
                <option value="" disabled>{t("chooseEmployee")}</option>
                {all.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </Select>
            </Field>
            <Field label={t("date")} htmlFor="date"><DatePicker id="date" name="date" defaultValue={today} dateFormat={fmt} /></Field>
            <Field label={t("start")} htmlFor="start"><Input id="start" name="start" type="time" required /></Field>
            <Field label={t("end")} htmlFor="end"><Input id="end" name="end" type="time" required /></Field>
            <div className="sm:col-span-2 lg:col-span-3"><Input name="notes" maxLength={500} placeholder={t("notes")} aria-label={t("notes")} /></div>
            <div><Button type="submit">{t("add")}</Button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
