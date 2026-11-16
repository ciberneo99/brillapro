import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Select } from "@/components/ui";
import { JobFields } from "@/components/jobs/JobFields";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { FREQUENCIES } from "@/modules/recurring/module";
import { formatTime } from "@/lib/time";
import { listEmployees } from "@/modules/employees/module";
import { DeleteJobMenu } from "@/components/jobs/DeleteJobMenu";
import { assignEmployee, deleteJob, loadChecklist, setJobStatus, toggleJobItem, unassignEmployee, updateJob } from "@/modules/jobs/actions";
import { getJob } from "@/modules/jobs/queries";
import { createInvoiceFromJob } from "@/modules/invoices/actions";
import { invoiceForJob } from "@/modules/invoices/queries";
import { listServiceTypes } from "@/modules/services/queries";

export const metadata = { title: "Job" };

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "jobs:read")) redirect("/dashboard");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const job = await getJob(id);
  if (!job) notFound();
  const t = await getTranslations("jobs");
  const staff = can(ctx.role, "jobs:write");
  const fmt = ctx.settings.date_format;
  const m = (c: number) => formatMoney(c, ctx.settings.currency);
  const [employees, services] = staff ? await Promise.all([listEmployees({ activeOnly: true }), listServiceTypes()]) : [[], []];
  const free = employees.filter((e) => !job.assigned.some((a) => a.employee_id === e.id));
  const canInvoice = can(ctx.role, "invoices:write");
  const existingInvoice = can(ctx.role, "invoices:read") ? await invoiceForJob(id) : null;
  const done = job.items.filter((i) => i.is_done).length;
  const groups: { category: string; items: typeof job.items }[] = [];
  for (const it of job.items) {
    const g = groups.find((x) => x.category === it.category);
    if (g) g.items.push(it); else groups.push({ category: it.category, items: [it] });
  }
  const tr = await getTranslations("recurring");
  const series = job.recurring_schedule_id
    ? (await (await createClient()).from("recurring_schedules").select("frequency,is_active").eq("id", job.recurring_schedule_id).maybeSingle()).data
    : null;
  const seriesActive = series?.is_active ? series : null;
  const next = job.status === "scheduled" ? "in_progress" : job.status === "in_progress" ? "completed" : null;
  const labels = {
    title: t("titleField"), service: t("service"), noService: t("noService"), date: t("date"), start: t("start"), end: t("end"),
    address: t("address"), access: t("access"), price: t("price"), notes: t("notes"),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/jobs" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">{job.title} <JobStatusBadge status={job.status} /></h1>
          <p className="mt-1 text-sm text-muted">
            {staff ? <Link href={`/customers/${job.customer_id}`} className="text-primary hover:underline">{job.customer_name}</Link> : job.customer_name}
            {" · "}{formatDateOnly(job.scheduled_date, fmt)}
            {job.start_time && ` · ${formatTime(job.start_time)}${job.end_time ? `–${formatTime(job.end_time)}` : ""}`}
            {job.quote_id && staff && <> · <Link href={`/quotes/${job.quote_id}`} className="text-primary hover:underline">{t("fromQuote")}</Link></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {next && <form action={setJobStatus.bind(null, id, next)}><Button type="submit">{t(`action.${next}`)}</Button></form>}
          {staff && job.status !== "cancelled" && job.status !== "completed" && (
            <form action={setJobStatus.bind(null, id, "cancelled")}><Button type="submit" variant="secondary">{t("action.cancelled")}</Button></form>
          )}
          {staff && (job.status === "scheduled" || job.status === "cancelled") && (
            <DeleteJobMenu
              inSeries={Boolean(job.recurring_schedule_id)}
              labels={{ delete: t("delete.button"), one: t("delete.one"), following: t("delete.following"), series: t("delete.series"), confirmOne: t("delete.confirmOne"), confirmFollowing: t("delete.confirmFollowing"), confirmSeries: t("delete.confirmSeries") }}
              actions={{ one: deleteJob.bind(null, id, "one"), ...(job.recurring_schedule_id ? { following: deleteJob.bind(null, id, "following"), series: deleteJob.bind(null, id, "series") } : {}) }}
            />
          )}
          {staff && (job.status === "cancelled" || job.status === "completed") && (
            <form action={setJobStatus.bind(null, id, "scheduled")}><Button type="submit" variant="secondary">{t("action.scheduled")}</Button></form>
          )}
        </div>
      </div>

      {sp.error && <Alert>{t(sp.error === "status" ? "statusError" : sp.error === "delete" ? "delete.error" : sp.error === "invoice" ? "invoiceError" : "invalid")}</Alert>}
      {sp.saved && <Alert tone="success">{t("saved")}</Alert>}

      {(existingInvoice || (canInvoice && job.status !== "cancelled")) && (
        <Card accent="green" className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t("invoiceSection")}</h2>
          {existingInvoice ? (
            <Link href={`/invoices/${existingInvoice}`} className="text-sm text-primary hover:underline">{t("viewInvoice")}</Link>
          ) : (
            <form action={createInvoiceFromJob.bind(null, id)}><Button type="submit">{t("createInvoice")}</Button></form>
          )}
        </Card>
      )}

      {/* Checklist */}
      <Card accent="teal" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("checklist")}</h2>
          {job.items.length > 0 && <span className="text-sm text-muted">{t("progress", { done, total: job.items.length })}</span>}
        </div>
        {job.items.length === 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted">{t("noChecklist")}</p>
            {staff && job.service_type_id && <form action={loadChecklist.bind(null, id)}><Button type="submit" variant="secondary">{t("loadChecklist")}</Button></form>}
          </div>
        )}
        {groups.map((g) => (
          <section key={g.category || "_"}>
            <h3 className="mb-1 text-sm font-semibold text-muted">{g.category || t("general")}</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {g.items.map((it) => (
                <li key={it.id}>
                  <form action={toggleJobItem.bind(null, id, it.id, !it.is_done)}>
                    <button type="submit" className="flex w-full items-start gap-3 p-3 text-left hover:bg-surface-2">
                      <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${it.is_done ? "border-success bg-success text-primary-fg" : "border-line"}`}>{it.is_done ? "✓" : ""}</span>
                      <span className={it.is_done ? "text-muted line-through" : ""}>
                        {it.title}
                        {it.instructions && <span className="block text-xs text-muted">{it.instructions}</span>}
                      </span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Card>

      {/* Team */}
      <Card accent="violet" className="space-y-3">
        <h2 className="text-base font-semibold">{t("team")}</h2>
        {job.assigned.length === 0 && <p className="text-sm text-muted">{t("noTeam")}</p>}
        <ul className="flex flex-wrap gap-2">
          {job.assigned.map((a) => (
            <li key={a.employee_id} className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
              {a.full_name || t("you")}
              {staff && <form action={unassignEmployee.bind(null, id, a.employee_id)}><button type="submit" aria-label={t("unassign")} className="h-6 w-6 rounded-full text-muted hover:bg-line">×</button></form>}
            </li>
          ))}
        </ul>
        {staff && (free.length > 0 ? (
          <form action={assignEmployee.bind(null, id)} className="flex flex-wrap items-end gap-2">
            <Field label={t("assign")} htmlFor="employee_id">
              <Select id="employee_id" name="employee_id" required defaultValue="">
                <option value="" disabled>{t("chooseEmployee")}</option>
                {free.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </Select>
            </Field>
            <Button type="submit">{t("assignButton")}</Button>
          </form>
        ) : employees.length === 0 ? (
          <p className="text-sm text-muted">{t("noEmployees")} <Link href="/settings/employees" className="text-primary hover:underline">{t("addEmployees")}</Link></p>
        ) : null)}
      </Card>

      {/* Details */}
      <Card accent="blue">
        {staff ? (
          <form action={updateJob.bind(null, id)} className="space-y-4">
            <h2 className="text-base font-semibold">{t("details")}</h2>
            <JobFields
              v={{ title: job.title, service_type_id: job.service_type_id, scheduled_date: job.scheduled_date, start_time: job.start_time, end_time: job.end_time, address: job.address, access_notes: job.access_notes, price_cents: job.price_cents, notes: job.notes }}
              services={services.filter((s) => s.is_active || s.id === job.service_type_id)} labels={labels} dateFormat={fmt} currency={ctx.settings.currency}
            />
            {seriesActive && job.status === "scheduled" && (
              <fieldset className="space-y-2 rounded-xl border border-line bg-surface-2 p-3 text-sm">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("series.legend")}</legend>
                <label className="flex items-center gap-2"><input type="radio" name="series_scope" value="one" defaultChecked className="h-4 w-4" />{t("series.one")}</label>
                <label className="flex items-center gap-2"><input type="radio" name="series_scope" value="following" className="h-4 w-4" />{t("series.following")}</label>
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <span className="text-muted">{t("series.frequency")}</span>
                  <Select name="series_frequency" defaultValue={seriesActive.frequency} className="w-auto">
                    {FREQUENCIES.map((f) => <option key={f} value={f}>{tr(`frequency.${f}`)}</option>)}
                  </Select>
                </div>
                <p className="pl-6 text-xs text-muted">{t("series.help")}</p>
              </fieldset>
            )}
            <Button type="submit">{t("save")}</Button>
          </form>
        ) : (
          <div className="space-y-2 text-sm">
            <h2 className="text-base font-semibold">{t("details")}</h2>
            {job.address && <p>{job.address}</p>}
            {job.access_notes && <p><span className="text-muted">{t("access")}: </span>{job.access_notes}</p>}
            {job.notes && <p className="whitespace-pre-wrap">{job.notes}</p>}
          </div>
        )}
        {staff && <p className="mt-3 text-sm text-muted">{t("price")}: {m(job.price_cents)}</p>}
      </Card>
    </div>
  );
}
