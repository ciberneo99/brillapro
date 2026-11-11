import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft, BedDouble, Bath, CalendarClock, CalendarDays, Home, Mail, MapPin, MoreVertical, Pencil, Phone, Ruler } from "lucide-react";
import { Alert, Card } from "@/components/ui";
import { CustomerNotes } from "@/components/notebook/CustomerNotes";
import { ProfileTabs } from "@/components/customers/ProfileTabs";
import { Stars } from "@/components/customers/Stars";
import { StatusBadge } from "@/components/customers/StatusBadge";
import { getCustomerExtras, getCustomerYtdCents } from "@/modules/customers/list-extras";
import { todayIso } from "@/lib/calendar";
import { can } from "@/lib/permissions";
import { mapsUrl } from "@/lib/maps";
import { formatDateOnly, formatTimestamp } from "@/lib/dates";
import { requireContext } from "@/lib/session";
import { changeCustomerStatus, convertCustomer } from "@/modules/customers/actions";
import { getCustomer, getCustomerEvents, hasDuplicateEmail } from "@/modules/customers/queries";
import { centsToInput, displayName } from "@/modules/customers/schema";
import { QuoteStatusBadge } from "@/components/quotes/QuoteStatusBadge";
import { formatMoney, quoteNumber } from "@/lib/money";
import { getQuoteSettings, listQuotes } from "@/modules/quotes/queries";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { listJobs } from "@/modules/jobs/queries";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { duplicateInvoice } from "@/modules/invoices/actions";
import { getInvoiceSettings, listInvoices } from "@/modules/invoices/queries";

export default async function CustomerProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ note?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireContext();
  if (!can(ctx.role, "customers:read")) redirect("/dashboard");
  const c = await getCustomer(id);
  if (!c) notFound();
  const canQuotes = can(ctx.role, "quotes:read");
  const customerQuotes = canQuotes ? (await listQuotes({ customerId: id })).rows : [];
  const customerJobs = can(ctx.role, "jobs:read") ? (await listJobs({ customerId: id })).rows : [];
  const canInvoices = can(ctx.role, "invoices:read");
  const customerInvoices = canInvoices ? (await listInvoices({ customerId: id })).rows : [];
  const lastInvoice = customerInvoices.find((i) => i.status !== "void");
  const invoicePrefix = canInvoices ? (await getInvoiceSettings(ctx.tenant.id)).invoice_prefix : "INV-";
  const quotePrefix = canQuotes ? (await getQuoteSettings(ctx.tenant.id)).quote_prefix : "Q-";

  const year = todayIso(ctx.settings.timezone).slice(0, 4);
  const [ytd, extras] = canInvoices ? await Promise.all([getCustomerYtdCents(id, year), getCustomerExtras([id])]) : [0, new Map()];
  const owed = extras.get(id)?.outstanding_cents ?? 0;
  const [t, format, events, duplicate] = await Promise.all([
    getTranslations("customers"),
    getFormatter(),
    getCustomerEvents(id),
    hasDuplicateEmail(id, c.email),
  ]);
  const canWrite = can(ctx.role, "customers:write");
  const date = (d: string) => formatTimestamp(d, ctx.settings.date_format, ctx.settings.timezone);
  const dash = t("profile.none");

  const serviceAddress = [c.service_address, c.city, c.state, c.zip_code].filter(Boolean).join(", ");
  const cur = ctx.settings.currency;
  const chips: { icon: typeof Home; text: string }[] = [
    c.property_type ? { icon: Home, text: t(`propertyType.${c.property_type}` as never) } : null,
    c.bedrooms != null ? { icon: BedDouble, text: t("profile.bd", { n: c.bedrooms }) } : null,
    c.bathrooms != null ? { icon: Bath, text: t("profile.ba", { n: c.bathrooms }) } : null,
    c.square_footage ? { icon: Ruler, text: t("profile.sqft", { n: format.number(c.square_footage) }) } : null,
    c.cleaning_frequency ? { icon: CalendarClock, text: t(`frequency.${c.cleaning_frequency}` as never) } : null,
  ].filter((x): x is { icon: typeof Home; text: string } => x !== null);
  const noteRows: [string, string | null][] = [
    [t("form.preferredService"), c.preferred_service],
    [t("form.estimatedPrice"), c.estimated_price_cents != null ? format.number(Number(centsToInput(c.estimated_price_cents)), { style: "currency", currency: cur }) : null],
    [t("form.pets"), c.pets], [t("form.accessInstructions"), c.access_instructions],
    [t("form.specialInstructions"), c.special_instructions], [t("form.notes"), c.notes],
  ];
  const hasNotes = noteRows.some(([, v]) => v);
  const sinceDate = c.customer_since ? formatDateOnly(c.customer_since, ctx.settings.date_format) : date(c.created_at);
  const menuItem = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2";
  const rowCls = "flex items-center justify-between gap-3 py-2";

  const eventText = (e: (typeof events)[number]) =>
    e.type === "status_changed"
      ? t("profile.events.status_changed", { from: t(`status.${e.metadata.from}` as never), to: t(`status.${e.metadata.to}` as never) })
      : t(`profile.events.${e.type}` as never);

  const jobsPanel = (
    <div>
      {can(ctx.role, "jobs:write") && <div className="pb-1 text-right"><Link href={`/jobs/new?customer=${id}`} className="text-sm text-primary hover:underline">{t("profile.newJob")}</Link></div>}
      {customerJobs.length === 0 ? <p className="py-3 text-sm text-muted">{t("profile.noJobs")}</p> : (
        <ul className="divide-y divide-line text-sm">
          {customerJobs.map((j) => (
            <li key={j.id} className={rowCls}>
              <Link href={`/jobs/${j.id}`} className="min-w-0 truncate font-medium text-primary hover:underline">{j.title}</Link>
              <span className="shrink-0 text-xs text-muted">{formatDateOnly(j.scheduled_date, ctx.settings.date_format)}</span>
              <JobStatusBadge status={j.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  const invoicesPanel = (
    <div>
      {can(ctx.role, "invoices:write") && (
        <div className="flex items-center justify-end gap-3 pb-1">
          {lastInvoice && <form action={duplicateInvoice.bind(null, lastInvoice.id)}><button type="submit" className="text-sm text-primary hover:underline">{t("profile.repeatLast")}</button></form>}
          <Link href={`/invoices/new?customer=${id}`} className="text-sm text-primary hover:underline">{t("profile.newInvoice")}</Link>
        </div>
      )}
      {customerInvoices.length === 0 ? <p className="py-3 text-sm text-muted">{t("profile.noInvoices")}</p> : (
        <ul className="divide-y divide-line text-sm">
          {customerInvoices.map((i) => (
            <li key={i.id} className={rowCls}>
              <Link href={`/invoices/${i.id}`} className="font-medium text-primary hover:underline">{quoteNumber(invoicePrefix, i.number)}</Link>
              <span className="ml-auto font-semibold">{formatMoney(i.total_cents ?? 0, cur)}</span>
              <InvoiceStatusBadge status={i.display_status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  const quotesPanel = (
    <div>
      {can(ctx.role, "quotes:write") && <div className="pb-1 text-right"><Link href={`/quotes/new?customer=${id}`} className="text-sm text-primary hover:underline">{t("profile.newQuote")}</Link></div>}
      {customerQuotes.length === 0 ? <p className="py-3 text-sm text-muted">{t("profile.noQuotes")}</p> : (
        <ul className="divide-y divide-line text-sm">
          {customerQuotes.map((q) => (
            <li key={q.id} className={rowCls}>
              <Link href={`/quotes/${q.id}`} className="font-medium text-primary hover:underline">{quoteNumber(quotePrefix, q.number)}</Link>
              <span className="ml-auto font-semibold">{q.total_cents == null ? "—" : formatMoney(q.total_cents, cur)}</span>
              <QuoteStatusBadge status={q.display_status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  const tabs = [
    can(ctx.role, "jobs:read") ? { key: "jobs", label: t("profile.related.jobs"), count: customerJobs.length, content: jobsPanel } : null,
    canInvoices ? { key: "invoices", label: t("profile.related.invoices"), count: customerInvoices.length, content: invoicesPanel } : null,
    canQuotes ? { key: "quotes", label: t("profile.related.quotes"), count: customerQuotes.length, content: quotesPanel } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{displayName(c) || t("unnamed")}</h1>
              <StatusBadge status={c.status} />
              <Stars value={c.rating} label={c.rating ? t("list.stars", { count: c.rating }) : t("list.noRating")} />
            </div>
            {c.company_name && displayName(c) !== c.company_name && <p className="mt-0.5 text-sm text-muted">{c.company_name}</p>}
            {chips.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                {chips.map(({ icon: Icon, text }) => <li key={text} className="inline-flex items-center gap-1.5"><Icon className="h-4 w-4 text-primary" aria-hidden />{text}</li>)}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canInvoices && (
              <>
                <div className="rounded-xl border border-success/30 bg-success-soft px-4 py-2 text-center"><p className="text-xs text-success">{t("profile.ytd", { year })}</p><p className="text-xl font-extrabold">{formatMoney(ytd, cur)}</p></div>
                <div className={`rounded-xl border px-4 py-2 text-center ${owed > 0 ? "border-warning/30 bg-warning-soft" : "border-line bg-surface-2"}`}><p className={`text-xs ${owed > 0 ? "text-warning" : "text-muted"}`}>{t("profile.outstanding")}</p><p className="text-xl font-extrabold">{formatMoney(owed, cur)}</p></div>
              </>
            )}
            <Link href="/customers" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:opacity-90">
              <ArrowLeft className="h-4 w-4" aria-hidden />{t("profile.backShort")}
            </Link>
            {canWrite && (
              <details className="group relative">
                <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:opacity-90 [&::-webkit-details-marker]:hidden">
                  <MoreVertical className="h-4 w-4" aria-hidden />{t("profile.actions")}
                </summary>
                <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
                  <Link href={`/customers/${id}/edit`} className={menuItem}><Pencil className="h-4 w-4" aria-hidden />{t("profile.edit")}</Link>
                  {c.status === "prospect" && <form action={convertCustomer.bind(null, id)}><button type="submit" className={menuItem}>{t("profile.convert")}</button></form>}
                  {c.status === "active" && <form action={changeCustomerStatus.bind(null, id, "inactive")}><button type="submit" className={menuItem}>{t("profile.markInactive")}</button></form>}
                  {(c.status === "inactive" || c.status === "archived") && (
                    <form action={changeCustomerStatus.bind(null, id, "restore")}><button type="submit" className={menuItem}>{c.status === "archived" ? t("profile.restore") : t("profile.reactivate")}</button></form>
                  )}
                  {c.status !== "archived" && <form action={changeCustomerStatus.bind(null, id, "archive")}><button type="submit" className={`${menuItem} text-danger`}>{t("profile.archive")}</button></form>}
                </div>
              </details>
            )}
          </div>
        </div>
      </header>

      {duplicate && <Alert>{t("profile.duplicate")}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card accent="teal" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{t("profile.contact")}</h2>
            {canWrite && <Link href={`/customers/${id}/edit`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><Pencil className="h-3.5 w-3.5" aria-hidden />{t("profile.edit")}</Link>}
          </div>
          <dl className="space-y-3 text-sm">
            {c.email && <div className="flex gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><div className="min-w-0"><dt className="text-xs text-muted">{t("form.email")}</dt><dd className="break-words">{c.email}</dd></div></div>}
            {c.phone && <div className="flex gap-3"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><div><dt className="text-xs text-muted">{t("form.phone")}</dt><dd>{c.phone}</dd></div></div>}
            {c.secondary_phone && <div className="flex gap-3"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><div><dt className="text-xs text-muted">{t("form.secondaryPhone")}</dt><dd>{c.secondary_phone}</dd></div></div>}
            {serviceAddress && (
              <div className="flex gap-3 rounded-lg bg-surface-2 p-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                <div className="min-w-0"><dt className="text-xs text-muted">{t("form.serviceAddress")}</dt>
                  <dd><a href={mapsUrl(serviceAddress)} target="_blank" rel="noopener noreferrer" title={t("list.openMap")} className="break-words text-primary hover:underline">{serviceAddress}</a></dd></div></div>
            )}
            {c.billing_address && c.billing_address !== serviceAddress && (
              <div className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /><div className="min-w-0"><dt className="text-xs text-muted">{t("form.billingAddress")}</dt>
                <dd><a href={mapsUrl(c.billing_address)} target="_blank" rel="noopener noreferrer" title={t("list.openMap")} className="break-words text-primary hover:underline">{c.billing_address}</a></dd></div></div>
            )}
            {!c.email && !c.phone && !serviceAddress && <p className="text-muted">{dash}</p>}
            <div className="flex gap-3"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><div><dt className="text-xs text-muted">{t("profile.clientSince")}</dt><dd>{sinceDate}</dd>
              <p className="text-xs text-muted">{t("profile.source." + c.source)}</p></div></div>
          </dl>
        </Card>

        <Card accent="teal">
          {tabs.length > 0 ? <ProfileTabs tabs={tabs} initial={canInvoices ? "invoices" : undefined} /> : <p className="text-sm text-muted">{dash}</p>}
        </Card>

        <Card accent="teal" className="space-y-3">
          <h2 className="text-base font-semibold">{t("profile.clientNotes")}</h2>
          {hasNotes ? (
            <dl className="space-y-3 text-sm">
              {noteRows.filter(([, v]) => v).map(([label, value]) => (
                <div key={label} className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>
              ))}
            </dl>
          ) : <p className="text-sm text-muted">{t("profile.noNotes")}</p>}
        </Card>
      </div>

      {can(ctx.role, "notebook:read") && <CustomerNotes customerId={id} dateFormat={ctx.settings.date_format} timezone={ctx.settings.timezone} invalid={sp.note === "invalid"} />}

      <section className="rounded-xl border border-line bg-surface px-5 py-4" aria-labelledby="history-title">
        <h2 id="history-title" className="text-[8px] font-semibold uppercase tracking-wide text-muted">{t("profile.history")}</h2>
        <ol className="mt-2 space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 border-l border-line pl-2 text-[8px] leading-tight">
              <span>{eventText(e)}</span>
              <span className="text-muted">{date(e.created_at)}{e.actor_name ? ` · ${e.actor_name}` : ""}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
