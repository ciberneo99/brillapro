"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, FileText, Repeat, Timer, UserCheck, UserRound, Briefcase, CircleDot, ChevronDown, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import type { CustomerOption } from "@/components/invoices/CustomerSearch";
import { JobCustomerField } from "@/components/jobs/JobCustomerField";
import { DatePicker } from "@/components/ui/DatePicker";
import { MoneyInput } from "@/components/ui/fields";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { SmartTextInput } from "@/components/ui/SmartTextInput";
import { TimeBox, label as timeLabel, toVal } from "@/components/ui/TimeRange";

type Tone = "blue" | "green" | "violet" | "amber" | "rose" | "teal";
const tone = (t: Tone | "muted") => (t === "muted" ? "var(--fg-muted)" : `var(--c-${t})`);
const SERVICE_TONES: Tone[] = ["teal", "blue", "violet", "rose", "amber", "green"];
const DURATIONS = [30, 60, 90, 120, 150, 180, 240, 300, 360, 480];
const FREQS = ["weekly", "biweekly", "every_four_weeks", "monthly"] as const;
const STATUSES: { id: "scheduled" | "in_progress" | "completed" | "cancelled"; tone: Tone | "muted" }[] = [
  { id: "scheduled", tone: "amber" }, { id: "in_progress", tone: "violet" }, { id: "completed", tone: "green" }, { id: "cancelled", tone: "rose" },
];
const dur = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`; };

/** Coloured band that titles each block of the form. */
function Band({ color, icon: Icon, children }: { color: Tone | "muted"; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wide"
      style={{ color: tone(color), background: `color-mix(in srgb, ${tone(color)} 13%, var(--surface))` }}>
      <Icon className="h-4 w-4" />{children}
    </div>
  );
}

/** A pill-shaped choice. `color` tints the dot and the selected state. */
function Chip({ on, color, onClick, children, dot = true }: { on: boolean; color: Tone | "muted"; onClick: () => void; children: React.ReactNode; dot?: boolean }) {
  return (
    <button
      type="button" role="radio" aria-checked={on} onClick={onClick}
      className="bp-fx bp-fx-nobar inline-flex min-h-11 items-center gap-2.5 rounded-xl border bg-surface px-4 py-2 text-left text-sm font-medium"
      style={on
        ? { borderColor: tone(color), background: `color-mix(in srgb, ${tone(color)} 16%, var(--surface))`, ["--fx" as string]: tone(color) }
        : { borderColor: "var(--line)", ["--fx" as string]: tone(color) }}
    >
      {dot && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone(color) }} />}
      {children}
    </button>
  );
}

type DayJob = { id: string; title: string; customer: string; start: string | null; end: string | null };
const mins = (v: string | null) => (v ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5)) : null);

/**
 * "Schedule New Job": client search, service chips, date + start time + duration chips (with the day's existing jobs shown right there),
 * frequency, one assigned person and status. Repeating jobs become a recurring schedule on the server.
 */
export function NewJobForm({
  action, customers, initialCustomerId, services, employees, initialDate, dateFormat, currency,
}: {
  action: (formData: FormData) => Promise<void>; customers: CustomerOption[]; initialCustomerId?: string;
  services: { id: string; name: string }[]; employees: { id: string; full_name: string }[]; initialDate?: string; dateFormat: string; currency: string;
}) {
  const t = useTranslations("jobs.form");
  const ts = useTranslations("jobs.status");
  const tf = useTranslations("recurring.frequency");
  const [service, setService] = useState(services[0]?.id ?? "");
  const [status, setStatus] = useState<(typeof STATUSES)[number]["id"]>("scheduled");
  const [frequency, setFrequency] = useState("none");
  const [date, setDate] = useState(initialDate ?? "");
  const [start, setStart] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(120);
  const [custom, setCustom] = useState("");
  const [dayAll, setDay] = useState<DayJob[]>([]);
  const day = useMemo(() => (date ? dayAll : []), [date, dayAll]);

  const endMin = start != null && duration != null ? Math.min(start + duration, 24 * 60 - 1) : null;

  useEffect(() => {
    if (!date) return;
    const ctl = new AbortController();
    fetch(`/jobs/day?date=${date}`, { signal: ctl.signal }).then((r) => (r.ok ? r.json() : [])).then(setDay).catch(() => {});
    return () => ctl.abort();
  }, [date]);

  const clash = useMemo(() => {
    if (start == null) return [];
    const e = endMin ?? start + 1;
    return day.filter((j) => { const s = mins(j.start); const f = mins(j.end) ?? (s != null ? s + 60 : null); return s != null && f != null && s < e && start < f; });
  }, [day, start, endMin]);

  const pickDuration = (m: number) => { setDuration(m); setCustom(""); };
  const onCustom = (v: string) => {
    setCustom(v);
    const h = Number(v.replace(",", "."));
    setDuration(Number.isFinite(h) && h > 0 && h <= 16 ? Math.round(h * 60) : null);
  };

  const box = "rounded-2xl border border-line bg-surface p-4";
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="service_type_id" value={service} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="frequency" value={frequency === "none" ? "" : frequency} />
      <input type="hidden" name="end_time" value={endMin == null ? "" : toVal(endMin)} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        <Link href="/jobs" className="bp-fx bp-fx-nobar inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-primary hover:bg-primary-soft">
          <ArrowLeft className="h-4 w-4" aria-hidden />{t("back")}
        </Link>
      </div>

      <section className="space-y-3" aria-label={t("client")}>
        <Band color="blue" icon={UserRound}>{t("client")}</Band>
        <JobCustomerField customers={customers} initialId={initialCustomerId} />
      </section>

      <section className="space-y-3" aria-label={t("service")}>
        <Band color="violet" icon={Briefcase}>{t("service")}</Band>
        {services.length === 0 ? <p className="text-sm text-muted">{t("noServices")}</p> : (
          <div role="radiogroup" aria-label={t("service")} className="flex flex-wrap gap-2">
            {services.map((s, i) => <Chip key={s.id} on={service === s.id} color={SERVICE_TONES[i % SERVICE_TONES.length]} onClick={() => setService(s.id)}>{s.name}</Chip>)}
          </div>
        )}
      </section>

      <section className="space-y-3" aria-label={t("dateTime")}>
        <Band color="amber" icon={CalendarDays}>{t("dateTime")}</Band>
        <div className={clsx(box, "space-y-4")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="scheduled_date" className="block text-xs font-semibold uppercase tracking-wide text-muted">{t("date")}</label>
              <DatePicker id="scheduled_date" name="scheduled_date" required defaultValue={initialDate ?? ""} dateFormat={dateFormat} onChange={setDate} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="start_time" className="block text-xs font-semibold uppercase tracking-wide text-muted">{t("startTime")}</label>
              <TimeBox id="start_time" name="start_time" value={start} onChange={setStart} options={Array.from({ length: 96 }, (_, i) => i * 15)} placeholder={t("selectTime")} ariaLabel={t("startTime")} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("duration")}</p>
            <div role="radiogroup" aria-label={t("duration")} className="flex flex-wrap items-center gap-1.5">
              {DURATIONS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={duration === m && !custom} onClick={() => pickDuration(m)}
                  className={clsx("bp-fx bp-fx-nobar h-9 rounded-lg border px-3 text-sm font-medium",
                    duration === m && !custom ? "border-[var(--c-amber)] bg-[var(--c-amber)] text-white" : "border-line bg-surface hover:border-[var(--c-amber)]")}
                  style={{ ["--fx" as string]: "var(--c-amber)" }}>
                  {dur(m)}
                </button>
              ))}
              <span className="ml-1 inline-flex items-center gap-1.5 text-sm text-muted">
                <input inputMode="decimal" aria-label={t("customHours")} value={custom} onChange={(e) => onCustom(e.target.value)} placeholder="2"
                  className="h-9 w-16 rounded-lg border border-line bg-surface px-2 text-center text-sm text-fg" />
                {t("hrs")}
              </span>
            </div>
            {start != null && endMin != null && (
              <p className="text-sm text-muted">{timeLabel(start)} – {timeLabel(endMin)}</p>
            )}
          </div>

          {date && (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium"><CalendarDays className="h-4 w-4 text-muted" aria-hidden />{t("thatDay", { count: day.length })}</p>
              {day.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {day.slice(0, 6).map((j) => (
                    <li key={j.id} className={clsx("flex flex-wrap items-center gap-x-3 text-muted", clash.some((c) => c.id === j.id) && "font-medium text-warning")}>
                      <span className="w-36 shrink-0 tabular-nums">{j.start ? `${timeLabel(mins(j.start)!)}${j.end ? ` – ${timeLabel(mins(j.end)!)}` : ""}` : t("allDay")}</span>
                      <span className="truncate">{j.customer} · {j.title}</span>
                    </li>
                  ))}
                  {day.length > 6 && <li className="text-muted">{t("more", { count: day.length - 6 })}</li>}
                </ul>
              )}
              {clash.length > 0 && (
                <p role="alert" className="mt-2 flex items-center gap-2 font-medium text-warning"><AlertTriangle className="h-4 w-4" aria-hidden />{t("clash")}</p>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="space-y-3" aria-label={t("frequency")}>
          <Band color="teal" icon={Repeat}>{t("frequency")}</Band>
          <SelectMenu ariaLabel={t("frequency")} value={frequency} onChange={setFrequency} className="h-12"
            options={[{ value: "none", label: t("noRepeat") }, ...FREQS.map((f) => ({ value: f, label: tf(f) }))]} />
          {frequency !== "none" && (
            <div className="space-y-1.5">
              <label htmlFor="until_date" className="block text-xs font-semibold uppercase tracking-wide text-muted">{t("until")}</label>
              <DatePicker id="until_date" name="until_date" dateFormat={dateFormat} />
              <p className="text-xs text-muted">{t("repeatHelp")}</p>
            </div>
          )}
        </section>
        <section className="space-y-3" aria-label={t("staff")}>
          <Band color="blue" icon={UserCheck}>{t("staff")}</Band>
          <SelectMenu name="employee_id" ariaLabel={t("staff")} defaultValue="" className="h-12"
            options={[{ value: "", label: t("unassigned") }, ...employees.map((e) => ({ value: e.id, label: e.full_name }))]} />
        </section>
      </div>

      <section className="space-y-3" aria-label={t("status")}>
        <Band color="rose" icon={Timer}>{t("status")}</Band>
        <div role="radiogroup" aria-label={t("status")} className={clsx("flex flex-wrap gap-2", frequency !== "none" && "pointer-events-none opacity-50")}>
          {STATUSES.map((s) => <Chip key={s.id} on={(frequency !== "none" ? "scheduled" : status) === s.id} color={s.tone} onClick={() => setStatus(s.id)}>{ts(s.id)}</Chip>)}
        </div>
      </section>

      <section className="space-y-3" aria-label={t("notes")}>
        <Band color="muted" icon={FileText}>{t("notes")}</Band>
        <textarea name="notes" rows={3} maxLength={2000} placeholder={t("notesPlaceholder")}
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm placeholder:text-muted" />
      </section>

      <details className="group rounded-2xl border border-line bg-surface">
        <summary className="bp-fx-item flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-medium hover:bg-primary-soft">
          <span className="flex items-center gap-2"><CircleDot className="h-4 w-4 text-primary" aria-hidden />{t("moreDetails")}</span>
          <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="price" className="block text-sm font-medium">{t("price")}</label>
            <MoneyInput id="price" name="price" defaultValue="0.00" currency={currency} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="address" className="block text-sm font-medium">{t("address")}</label>
            <SmartTextInput id="address" name="address" mode="address" maxLength={300} />
            <p className="text-xs text-muted">{t("addressHelp")}</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="access_notes" className="block text-sm font-medium">{t("access")}</label>
            <textarea id="access_notes" name="access_notes" rows={2} maxLength={1000} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
          </div>
        </div>
      </details>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <Link href="/jobs" className="bp-fx bp-fx-nobar inline-flex h-11 items-center rounded-xl border border-line bg-surface px-5 text-sm font-medium hover:border-primary hover:bg-primary-soft">{t("cancel")}</Link>
        <button type="submit" className="bp-fx bp-fx-solid inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
          {frequency === "none" ? t("save") : t("saveSeries")}
        </button>
      </div>
    </form>
  );
}
