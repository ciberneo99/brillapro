import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field } from "@/components/ui";
import { DatePicker } from "@/components/ui/DatePicker";
import { BillToDetails } from "@/components/invoices/BillToDetails";
import { SheetHeader } from "@/components/invoices/SheetHeader";
import { QuoteEditor } from "@/components/quotes/QuoteEditor";
import { QuoteStatusBadge } from "@/components/quotes/QuoteStatusBadge";
import { QuoteToolbar } from "@/components/quotes/QuoteToolbar";
import { fullAddress } from "@/lib/business";
import { formatDateOnly } from "@/lib/dates";
import { logoUrl } from "@/lib/logo-server";
import { centsToMoneyText, formatMoney, quoteNumber } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/modules/customers/schema";
import { createJobFromQuote } from "@/modules/jobs/actions";
import { jobForQuote } from "@/modules/jobs/queries";
import { saveQuoteDraft } from "@/modules/quotes/actions";
import { getQuote, getQuoteSettings } from "@/modules/quotes/queries";
import { listServiceTypes } from "@/modules/services/queries";

export const metadata = { title: "Quote" };

type SP = { error?: string; saved?: string };

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "quotes:read")) redirect("/dashboard");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await getQuote(id);
  if (!q) notFound();
  const t = await getTranslations("quotes");
  const te = await getTranslations("quotes.editor");
  const qs = await getQuoteSettings(ctx.tenant.id);
  const canWrite = can(ctx.role, "quotes:write");
  const draft = q.status === "draft";
  const editable = draft && canWrite;
  const cur = ctx.settings.currency;
  const fmt = ctx.settings.date_format;
  const m = (c: number) => formatMoney(c, cur);
  const num = quoteNumber(qs.quote_prefix, q.number);
  const name = displayName(q.customer);
  const totalOf = (oid: string | null) => q.totals.find((x) => x.option_id === oid);
  const existingJob = q.status === "accepted" && can(ctx.role, "jobs:read") ? await jobForQuote(id) : null;
  const headline = totalOf(q.selected_option_id ?? q.options[0]?.id ?? null);
  const company = {
    name: ctx.tenant.name, address: fullAddress(ctx.settings), website: ctx.settings.website, phone: ctx.settings.phone, email: ctx.settings.email, taxId: ctx.settings.tax_id,
    logoUrl: await logoUrl(ctx.settings.logo_path),
  };
  const c = q.customer;
  const customerAddress = [c.service_address, c.city, [c.state, c.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;

  let customers: { id: string; name: string; email: string | null; phone: string | null; address: string | null; company: string | null }[] = [];
  let services: { id: string; name: string }[] = [];
  if (editable) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("customers").select("id,first_name,last_name,company_name,email,phone,billing_address,service_address,city,state,zip_code")
      .or(`status.neq.archived,id.eq.${q.customer_id}`).order("first_name").limit(1000);
    customers = (data ?? []).map((r) => ({
      id: r.id, name: displayName(r), email: r.email, phone: r.phone, company: r.company_name || null,
      address: [r.service_address || r.billing_address, r.city, [r.state, r.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
    }));
    services = (await listServiceTypes()).filter((s) => s.is_active || s.id === q.service_type_id).map((s) => ({ id: s.id, name: s.name }));
  }

  const mailto = c.email
    ? `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(t("mail.subject", { number: num, business: ctx.tenant.name }))}&body=${encodeURIComponent(
        t("mail.body", { name: c.first_name || name, number: num, total: headline ? m(headline.total_cents) : "", date: formatDateOnly(q.expires_on, fmt), business: ctx.tenant.name }),
      )}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {num} <QuoteStatusBadge status={q.display_status} />
          </h1>
          <p className="mt-1 text-sm text-muted">
            <Link href={`/customers/${q.customer_id}`} className="text-primary hover:underline">{name}</Link>
            {q.serviceName ? ` · ${q.serviceName}` : ""} · {t("expires")} {formatDateOnly(q.expires_on, fmt)}
          </p>
        </div>
        <QuoteToolbar
          id={id} draft={draft} open={q.status === "draft" || q.status === "sent"} resend={q.status === "sent"} canWrite={canWrite} mailto={mailto}
          options={q.options.map((o) => ({ id: o.id, label: `${o.name} — ${m(totalOf(o.id)?.total_cents ?? 0)}` }))}
        />
      </div>

      {sp.error && <Alert>{t(sp.error === "option" ? "chooseOption" : "invalid")}</Alert>}
      {sp.saved && <Alert tone="success">{t("saved")}</Alert>}
      {q.display_status === "expired" && <Alert>{t("expiredNote")}</Alert>}
      {!draft && <p className="text-sm text-muted">{t("lockedNote")}</p>}

      {q.status === "accepted" && can(ctx.role, "jobs:write") && (
        <Card accent="green" className="space-y-2">
          <h2 className="text-base font-semibold">{t("jobSection")}</h2>
          {existingJob ? (
            <Link href={`/jobs/${existingJob}`} className="text-sm text-primary hover:underline">{t("viewJob")}</Link>
          ) : (
            <form action={createJobFromQuote.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <Field label={t("jobDate")} htmlFor="scheduled_date"><DatePicker id="scheduled_date" name="scheduled_date" dateFormat={fmt} /></Field>
              <Button type="submit">{t("createJob")}</Button>
            </form>
          )}
        </Card>
      )}

      {editable ? (
        <QuoteEditor
          number={num} company={company} customers={customers} services={services} currency={cur} dateFormat={fmt} error={sp.error === "invalid"}
          action={saveQuoteDraft.bind(null, id)}
          initial={{
            customerId: q.customer_id, serviceId: q.service_type_id ?? "", title: q.title ?? "", issueDate: q.issue_date, expiresOn: q.expires_on,
            discount: centsToMoneyText(q.discount_cents), taxRate: String(q.tax_rate), notes: q.notes ?? "", terms: q.terms ?? "",
            options: q.options.map((o) => ({ name: o.name, description: o.description ?? "", price: centsToMoneyText(o.base_price_cents) })),
            lines: q.lines.map((l) => ({ description: l.description, quantity: String(l.quantity), price: centsToMoneyText(l.unit_price_cents) })),
          }}
        />
      ) : (
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-8">
          <SheetHeader company={company} alt={te("logoAlt")}>
            <div className="space-y-1 text-sm">
              <p className="text-3xl font-bold tracking-tight text-primary">{te("quote")}</p>
              <p className="font-semibold">{num}</p>
              <p className="text-muted">{te("date")}: {formatDateOnly(q.issue_date, fmt)}</p>
              <p className="text-muted">{te("validUntil")}: {formatDateOnly(q.expires_on, fmt)}</p>
            </div>
          </SheetHeader>
          <div className="grid gap-4 border-b border-line py-6 md:grid-cols-[minmax(0,22rem)_1fr]">
            <h2 className="text-base font-bold uppercase tracking-tight">{te("preparedFor")}</h2>
            <BillToDetails name={name} company={c.company_name || null} address={customerAddress} email={c.email} phone={c.phone} />
          </div>

          {(q.title || q.serviceName) && (
            <div className="pt-6">
              {q.title && <p className="text-lg font-semibold">{q.title}</p>}
              {q.serviceName && <p className="text-sm text-muted">{te("service")}: {q.serviceName}</p>}
            </div>
          )}

          {q.options.length > 0 && (
            <ul className="space-y-3 pt-6">
              {q.options.map((o) => {
                const chosen = q.selected_option_id === o.id;
                return (
                  <li key={o.id} className={`rounded-lg border p-4 ${chosen ? "border-success bg-success-soft" : "border-line"}`}>
                    <div className="flex justify-between gap-3 font-semibold"><span>{o.name}{chosen ? " ✓" : ""}</span><span>{m(o.base_price_cents)}</span></div>
                    {o.description && <p className="mt-1 text-sm text-muted">{o.description}</p>}
                    <p className="mt-2 flex justify-between text-sm"><span className="text-muted">{te("optionTotal")}</span><strong>{m(totalOf(o.id)?.total_cents ?? 0)}</strong></p>
                  </li>
                );
              })}
            </ul>
          )}

          {q.lines.length > 0 && (
            <div className="pt-6">
              <h3 className="mb-2 text-base font-bold tracking-tight">{te("extras")}</h3>
              <div className="hidden grid-cols-[minmax(0,1fr)_5rem_8rem_7rem] gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white md:grid">
                <span>{te("description")}</span><span className="text-right">{te("qty")}</span><span className="text-right">{te("rate")}</span><span className="text-right">{te("amount")}</span>
              </div>
              <ul className="divide-y divide-line text-sm">
                {q.lines.map((l) => (
                  <li key={l.id} className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 px-3 py-3 md:grid-cols-[minmax(0,1fr)_5rem_8rem_7rem]">
                    <span>{l.description}</span>
                    <span className="text-right md:order-none">{l.quantity}</span>
                    <span className="text-right text-muted md:text-fg">{m(l.unit_price_cents)}</span>
                    <span className="text-right font-semibold">{m(Math.round(l.quantity * l.unit_price_cents))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-6 border-t border-line pt-6 md:mt-6 md:grid-cols-2">
            <div className="space-y-4 text-sm">
              {q.notes && <div><p className="font-semibold">{te("notes")}</p><p className="whitespace-pre-wrap text-muted">{q.notes}</p></div>}
              {q.terms && <div><p className="font-semibold">{te("terms")}</p><p className="whitespace-pre-wrap text-xs text-muted">{q.terms}</p></div>}
            </div>
            <div className="space-y-3 md:ml-auto md:w-full md:max-w-xs">
              {q.totals.map((x) => {
                const opt = q.options.find((o) => o.id === x.option_id);
                return (
                  <dl key={x.option_id ?? "none"} className="space-y-1 rounded-lg border border-line p-3 text-sm">
                    {opt && <dt className="font-semibold">{opt.name}</dt>}
                    <div className="flex justify-between"><dt className="text-muted">{te("subtotal")}</dt><dd>{m(x.subtotal_cents)}</dd></div>
                    {x.discount_cents > 0 && <div className="flex justify-between"><dt className="text-muted">{te("discount")}</dt><dd>−{m(x.discount_cents)}</dd></div>}
                    {q.tax_rate > 0 && <div className="flex justify-between"><dt className="text-muted">{te("tax")} ({q.tax_rate}%)</dt><dd>{m(x.tax_cents)}</dd></div>}
                    <div className="flex justify-between rounded-lg bg-primary px-3 py-2 text-base font-semibold text-white"><dt>{te("total")}</dt><dd>{m(x.total_cents)}</dd></div>
                  </dl>
                );
              })}
            </div>
          </div>
          <p className="pt-8 text-center text-sm font-semibold text-muted">{te("thanks")}</p>
        </div>
      )}
    </div>
  );
}
