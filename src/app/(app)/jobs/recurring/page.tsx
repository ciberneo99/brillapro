import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Select } from "@/components/ui";
import { DatePicker } from "@/components/ui/DatePicker";
import { JobFields } from "@/components/jobs/JobFields";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/time";
import { displayName } from "@/modules/customers/schema";
import { listEmployees } from "@/modules/employees/module";
import { createSchedule, endSchedule, extendSchedule } from "@/modules/recurring/actions";
import { FREQUENCIES, listSchedules } from "@/modules/recurring/module";
import { listServiceTypes } from "@/modules/services/queries";

export const metadata = { title: "Recurring jobs" };
type SP = { error?: string; created?: string; ended?: string };

export default async function RecurringPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "jobs:write")) redirect("/jobs");
  const sp = await searchParams;
  const t = await getTranslations("recurring");
  const tj = await getTranslations("jobs");
  const fmt = ctx.settings.date_format;
  const supabase = await createClient();
  const [schedules, employees, services, { data: customers }] = await Promise.all([
    listSchedules(),
    listEmployees({ activeOnly: true }),
    listServiceTypes(),
    supabase.from("customers").select("id,first_name,last_name,company_name").neq("status", "archived").order("first_name").limit(1000),
  ]);
  const labels = {
    title: tj("titleField"), service: tj("service"), noService: tj("noService"), date: t("startDate"), start: tj("start"), end: tj("end"),
    address: tj("address"), access: tj("access"), price: tj("price"), notes: tj("notes"),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/jobs" className="text-sm text-muted hover:text-fg">← {tj("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </div>
      {sp.error && <Alert>{t("invalid")}</Alert>}
      {sp.created !== undefined && <Alert tone="success">{t("createdJobs", { count: Number(sp.created) })}</Alert>}
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
          {s.is_active && (
            <div className="flex flex-wrap gap-2">
              <form action={extendSchedule.bind(null, s.id)}><Button type="submit" variant="secondary">{t("extend")}</Button></form>
              <form action={endSchedule.bind(null, s.id, false)}><Button type="submit" variant="ghost">{t("end")}</Button></form>
              <form action={endSchedule.bind(null, s.id, true)}><Button type="submit" variant="ghost" className="text-danger">{t("endCancel")}</Button></form>
            </div>
          )}
        </Card>
      ))}

      <Card accent="green">
        <h2 className="mb-3 text-base font-semibold">{t("new")}</h2>
        {(customers ?? []).length === 0 ? (
          <p className="text-sm">{tj("needCustomer")} <Link href="/customers/new" className="text-primary hover:underline">{tj("addCustomer")}</Link></p>
        ) : (
          <form action={createSchedule} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tj("customer")} htmlFor="customer_id">
                <Select id="customer_id" name="customer_id" required defaultValue="">
                  <option value="" disabled>{tj("chooseCustomer")}</option>
                  {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{displayName(c)}</option>)}
                </Select>
              </Field>
              <Field label={t("repeats")} htmlFor="frequency">
                <Select id="frequency" name="frequency" defaultValue="weekly">
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{t(`frequency.${f}`)}</option>)}
                </Select>
              </Field>
            </div>
            <JobFields v={{}} services={services.filter((x) => x.is_active)} labels={labels} dateFormat={fmt} currency={ctx.settings.currency} dateName="start_date" />
            <Field label={t("untilOptional")} htmlFor="until_date"><DatePicker id="until_date" name="until_date" dateFormat={fmt} /></Field>
            {employees.length > 0 && (
              <fieldset>
                <legend className="mb-1 text-sm font-medium">{t("team")}</legend>
                <div className="flex flex-wrap gap-3">
                  {employees.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="employee_ids" value={e.id} className="h-4 w-4" /> {e.full_name}</label>
                  ))}
                </div>
              </fieldset>
            )}
            <p className="text-xs text-muted">{t("createHelp")}</p>
            <Button type="submit">{t("create")}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
