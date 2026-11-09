import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { DatePicker } from "@/components/ui/DatePicker";
import { MoneyInput } from "@/components/ui/fields";
import { QuoteStatusBadge } from "@/components/quotes/QuoteStatusBadge";
import { SendQuoteButton } from "@/components/quotes/SendQuoteButton";
import { formatDateOnly } from "@/lib/dates";
import { centsToMoneyText, formatMoney, quoteNumber } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import {
  acceptQuote, addLine, addOption, declineQuote, deleteLine, deleteOption, deleteQuote, duplicateQuote, updateLine, updateOption, updateQuote,
} from "@/modules/quotes/actions";
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
  const qs = await getQuoteSettings(ctx.tenant.id);
  const canWrite = can(ctx.role, "quotes:write");
  const draft = q.status === "draft";
  const editable = draft && canWrite;
  const cur = ctx.settings.currency;
  const fmt = ctx.settings.date_format;
  const m = (c: number) => formatMoney(c, cur);
  const num = quoteNumber(qs.quote_prefix, q.number);
  const name = `${q.customer.first_name} ${q.customer.last_name}`.trim() || q.customer.company_name;
  const services = (await listServiceTypes()).filter((s) => s.is_active || s.id === q.service_type_id);
  const totalOf = (oid: string | null) => q.totals.find((x) => x.option_id === oid);
  const headline = totalOf(q.selected_option_id ?? q.options[0]?.id ?? null);

  const mailto = q.customer.email
    ? `mailto:${encodeURIComponent(q.customer.email)}?subject=${encodeURIComponent(t("mail.subject", { number: num, business: ctx.tenant.name }))}&body=${encodeURIComponent(
        t("mail.body", { name: q.customer.first_name || name, number: num, total: headline ? m(headline.total_cents) : "", date: formatDateOnly(q.expires_on, fmt), business: ctx.tenant.name }),
      )}`
    : null;

  const row = "grid gap-2 sm:grid-cols-[1fr_1fr_9rem_auto]";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/quotes" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {num} <QuoteStatusBadge status={q.display_status} />
          </h1>
          <p className="mt-1 text-sm text-muted">
            <Link href={`/customers/${q.customer_id}`} className="text-primary hover:underline">{name}</Link>
            {q.serviceName ? ` · ${q.serviceName}` : ""} · {t("expires")} {formatDateOnly(q.expires_on, fmt)}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <a href={`/quotes/${id}/pdf`} target="_blank" rel="noopener" className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">{t("pdf")}</a>
          {canWrite && <form action={duplicateQuote.bind(null, id)}><Button type="submit" variant="secondary">{t("duplicate")}</Button></form>}
          {canWrite && draft && <form action={deleteQuote.bind(null, id)}><Button type="submit" variant="ghost" className="text-danger">{t("delete")}</Button></form>}
        </div>
      </div>

      {sp.error && <Alert>{t(sp.error === "option" ? "chooseOption" : "invalid")}</Alert>}
      {sp.saved && <Alert tone="success">{t("saved")}</Alert>}
      {q.display_status === "expired" && <Alert>{t("expiredNote")}</Alert>}
      {!draft && <p className="text-sm text-muted">{t("lockedNote")}</p>}

      {/* Send / respond */}
      {canWrite && (q.status === "draft" || q.status === "sent") && (
        <Card accent="green" className="space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            {mailto ? (
              <SendQuoteButton id={id} mailto={mailto} resend={q.status === "sent"} />
            ) : (
              <p className="text-sm text-muted">{t("noEmail")}</p>
            )}
            <p className="max-w-md text-xs text-muted">{t("sendHelp")}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
            <form action={acceptQuote.bind(null, id)} className="flex flex-wrap items-end gap-2">
              {q.options.length > 0 && (
                <Field label={t("acceptedOption")} htmlFor="option_id">
                  <Select id="option_id" name="option_id" required defaultValue="">
                    <option value="" disabled>{t("chooseOptionPlaceholder")}</option>
                    {q.options.map((o) => <option key={o.id} value={o.id}>{o.name} — {m(totalOf(o.id)?.total_cents ?? 0)}</option>)}
                  </Select>
                </Field>
              )}
              <Button type="submit">{t("markAccepted")}</Button>
            </form>
            <form action={declineQuote.bind(null, id)}><Button type="submit" variant="secondary">{t("markDeclined")}</Button></form>
          </div>
        </Card>
      )}

      {/* Details */}
      <Card accent="blue">
        {editable ? (
          <form action={updateQuote.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
            <h2 className="text-base font-semibold sm:col-span-2">{t("details")}</h2>
            <Field label={t("titleField")} htmlFor="title"><Input id="title" name="title" defaultValue={q.title ?? ""} maxLength={120} /></Field>
            <Field label={t("service")} htmlFor="service_type_id">
              <Select id="service_type_id" name="service_type_id" defaultValue={q.service_type_id ?? ""}>
                <option value="">{t("noService")}</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label={t("issueDate")} htmlFor="issue_date"><DatePicker id="issue_date" name="issue_date" defaultValue={q.issue_date} dateFormat={fmt} /></Field>
            <Field label={t("expires")} htmlFor="expires_on"><DatePicker id="expires_on" name="expires_on" defaultValue={q.expires_on} dateFormat={fmt} /></Field>
            <Field label={t("discount")} htmlFor="discount"><MoneyInput id="discount" name="discount" defaultValue={centsToMoneyText(q.discount_cents)} currency={cur} /></Field>
            <Field label={t("taxRate")} htmlFor="tax_rate"><Input id="tax_rate" name="tax_rate" inputMode="decimal" defaultValue={String(q.tax_rate)} maxLength={6} /></Field>
            <div className="sm:col-span-2">
              <Field label={t("notes")} htmlFor="notes">
                <textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={q.notes ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("terms")} htmlFor="terms">
                <textarea id="terms" name="terms" rows={4} maxLength={3000} defaultValue={q.terms ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
              </Field>
            </div>
            <div className="sm:col-span-2"><Button type="submit">{t("saveDetails")}</Button></div>
          </form>
        ) : (
          <div className="space-y-2 text-sm">
            <h2 className="text-base font-semibold">{q.title || t("details")}</h2>
            <p>{t("issueDate")}: {formatDateOnly(q.issue_date, fmt)} · {t("expires")}: {formatDateOnly(q.expires_on, fmt)}</p>
            {q.discount_cents > 0 && <p>{t("discount")}: {m(q.discount_cents)}</p>}
            {q.tax_rate > 0 && <p>{t("taxRate")}: {q.tax_rate}%</p>}
            {q.notes && <p className="whitespace-pre-wrap">{q.notes}</p>}
            {q.terms && <p className="whitespace-pre-wrap text-xs text-muted">{q.terms}</p>}
          </div>
        )}
      </Card>

      {/* Options */}
      <Card accent="violet" className="space-y-3">
        <h2 className="text-base font-semibold">{t("options")}</h2>
        {q.options.length === 0 && <p className="text-sm text-muted">{t("noOptions")}</p>}
        {q.options.map((o) => {
          const tot = totalOf(o.id);
          return editable ? (
            <div key={o.id} className="space-y-1">
              <form action={updateOption.bind(null, id, o.id)} className={row}>
                <Input name="name" defaultValue={o.name} required maxLength={80} aria-label={t("optionName")} />
                <Input name="description" defaultValue={o.description ?? ""} maxLength={1000} placeholder={t("optionDescription")} aria-label={t("optionDescription")} />
                <MoneyInput id={`p-${o.id}`} name="price" defaultValue={centsToMoneyText(o.base_price_cents)} currency={cur} />
                <Button type="submit" variant="secondary">{t("save")}</Button>
              </form>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{t("optionTotal")}: <strong className="text-fg">{m(tot?.total_cents ?? 0)}</strong></span>
                <form action={deleteOption.bind(null, id, o.id)}><Button type="submit" variant="ghost" className="h-7 px-2 text-xs text-danger">{t("remove")}</Button></form>
              </div>
            </div>
          ) : (
            <div key={o.id} className={`rounded-lg border p-3 text-sm ${q.selected_option_id === o.id ? "border-success" : "border-line"}`}>
              <div className="flex justify-between font-medium"><span>{o.name}{q.selected_option_id === o.id ? ` ✓` : ""}</span><span>{m(tot?.total_cents ?? 0)}</span></div>
              {o.description && <p className="text-xs text-muted">{o.description}</p>}
            </div>
          );
        })}
        {editable && (
          <form action={addOption.bind(null, id)} className={`${row} border-t border-line pt-3`}>
            <Input name="name" required maxLength={80} placeholder={t("optionName")} aria-label={t("optionName")} />
            <Input name="description" maxLength={1000} placeholder={t("optionDescription")} aria-label={t("optionDescription")} />
            <MoneyInput id="p-new" name="price" currency={cur} />
            <Button type="submit">{t("addOption")}</Button>
          </form>
        )}
      </Card>

      {/* Extra lines */}
      <Card accent="amber" className="space-y-3">
        <h2 className="text-base font-semibold">{t("lines")}</h2>
        <p className="text-xs text-muted">{t("linesHelp")}</p>
        {q.lines.map((l) =>
          editable ? (
            <form key={l.id} action={updateLine.bind(null, id, l.id)} className="grid gap-2 sm:grid-cols-[1fr_5rem_9rem_auto_auto]">
              <Input name="description" defaultValue={l.description} required maxLength={200} aria-label={t("lineDescription")} />
              <Input name="quantity" defaultValue={String(l.quantity)} inputMode="decimal" aria-label={t("qty")} />
              <MoneyInput id={`l-${l.id}`} name="price" defaultValue={centsToMoneyText(l.unit_price_cents)} currency={cur} />
              <Button type="submit" variant="secondary">{t("save")}</Button>
              <Button type="submit" variant="ghost" className="text-danger" formAction={deleteLine.bind(null, id, l.id)} formNoValidate>{t("remove")}</Button>
            </form>
          ) : (
            <div key={l.id} className="flex justify-between text-sm">
              <span>{l.description} × {l.quantity}</span><span>{m(Math.round(l.quantity * l.unit_price_cents))}</span>
            </div>
          ),
        )}
        {editable && (
          <form action={addLine.bind(null, id)} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_5rem_9rem_auto]">
            <Input name="description" required maxLength={200} placeholder={t("lineDescription")} aria-label={t("lineDescription")} />
            <Input name="quantity" defaultValue="1" inputMode="decimal" aria-label={t("qty")} />
            <MoneyInput id="l-new" name="price" currency={cur} />
            <Button type="submit">{t("addLine")}</Button>
          </form>
        )}
      </Card>

      {/* Totals */}
      <Card accent="teal">
        <h2 className="mb-3 text-base font-semibold">{t("totals")}</h2>
        <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
          {q.totals.map((x) => {
            const opt = q.options.find((o) => o.id === x.option_id);
            return (
              <div key={x.option_id ?? "none"} className="space-y-1 rounded-lg border border-line p-3 text-sm">
                {opt && <p className="font-semibold">{opt.name}</p>}
                <p className="flex justify-between"><span className="text-muted">{t("subtotal")}</span>{m(x.subtotal_cents)}</p>
                {x.discount_cents > 0 && <p className="flex justify-between"><span className="text-muted">{t("discount")}</span>−{m(x.discount_cents)}</p>}
                {q.tax_rate > 0 && <p className="flex justify-between"><span className="text-muted">{t("tax")} ({q.tax_rate}%)</span>{m(x.tax_cents)}</p>}
                <p className="flex justify-between border-t border-line pt-1 text-base font-semibold"><span>{t("total")}</span>{m(x.total_cents)}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
