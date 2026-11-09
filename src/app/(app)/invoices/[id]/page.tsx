import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmailInput } from "@/components/ui/EmailInput";
import { MoneyInput } from "@/components/ui/fields";
import { SmartTextInput } from "@/components/ui/SmartTextInput";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { SendInvoiceButton } from "@/components/invoices/SendInvoiceButton";
import { todayIso } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { centsToMoneyText, formatMoney, quoteNumber } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import {
  addInvoiceLine, deleteInvoice, deleteInvoiceLine, deletePayment, recordPayment, updateInvoice, updateInvoiceLine, voidInvoice,
} from "@/modules/invoices/actions";
import { getInvoice, getInvoiceSettings } from "@/modules/invoices/queries";
import { PAYMENT_METHODS } from "@/modules/invoices/schema";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "invoices:read")) redirect("/dashboard");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const inv = await getInvoice(id);
  if (!inv) notFound();
  const t = await getTranslations("invoices");
  const settings = await getInvoiceSettings(ctx.tenant.id);
  const canWrite = can(ctx.role, "invoices:write");
  const draft = inv.status === "draft";
  const editable = draft && canWrite;
  const cur = ctx.settings.currency;
  const fmt = ctx.settings.date_format;
  const m = (c: number) => formatMoney(c, cur);
  const num = quoteNumber(settings.invoice_prefix, inv.number);
  const x = inv.totals;
  const today = todayIso(ctx.settings.timezone);
  const open = inv.status === "sent" && x.balance_cents > 0;

  const mailto = inv.customer_email
    ? `mailto:${encodeURIComponent(inv.customer_email)}?subject=${encodeURIComponent(t("mail.subject", { number: num, business: ctx.tenant.name }))}&body=${encodeURIComponent(
        t("mail.body", { name: inv.customer_name, number: num, total: m(x.total_cents), date: formatDateOnly(inv.due_date, fmt), business: ctx.tenant.name }),
      )}`
    : null;
  const ta = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/invoices" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">{num} <InvoiceStatusBadge status={inv.display_status} /></h1>
          <p className="mt-1 text-sm text-muted">
            <Link href={`/customers/${inv.customer_id}`} className="text-primary hover:underline">{inv.customer_name}</Link>
            {" · "}{t("due")} {formatDateOnly(inv.due_date, fmt)}
            {inv.job_id && can(ctx.role, "jobs:read") && <> · <Link href={`/jobs/${inv.job_id}`} className="text-primary hover:underline">{t("fromJob")}</Link></>}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <a href={`/invoices/${id}/pdf`} target="_blank" rel="noopener" className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">{t("pdf")}</a>
          {canWrite && draft && <form action={deleteInvoice.bind(null, id)}><Button type="submit" variant="ghost" className="text-danger">{t("delete")}</Button></form>}
          {canWrite && inv.status === "sent" && x.paid_cents === 0 && <form action={voidInvoice.bind(null, id)}><Button type="submit" variant="ghost" className="text-danger">{t("void")}</Button></form>}
        </div>
      </div>

      {sp.error && <Alert>{t(sp.error === "payment" ? "paymentError" : sp.error === "issue" ? "issueError" : sp.error === "void" ? "voidError" : "invalid")}</Alert>}
      {sp.saved && <Alert tone="success">{t("saved")}</Alert>}
      {!draft && <p className="text-sm text-muted">{t("lockedNote")}</p>}

      {canWrite && (draft || inv.status === "sent") && (
        <Card accent="green" className="space-y-2">
          <div className="flex flex-wrap items-start gap-3">
            {mailto ? <SendInvoiceButton id={id} mailto={mailto} resend={!draft} /> : <p className="text-sm text-muted">{t("noEmail")}</p>}
            <p className="max-w-md text-xs text-muted">{draft ? t("sendHelp") : t("resendHelp")}</p>
          </div>
        </Card>
      )}

      {/* Customer + dates */}
      <Card accent="blue">
        {editable ? (
          <form action={updateInvoice.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
            <h2 className="text-base font-semibold sm:col-span-2">{t("details")}</h2>
            <Field label={t("billTo")} htmlFor="customer_name"><SmartTextInput id="customer_name" name="customer_name" mode="name" defaultValue={inv.customer_name} required maxLength={160} /></Field>
            <Field label={t("email")} htmlFor="customer_email"><EmailInput id="customer_email" name="customer_email" defaultValue={inv.customer_email ?? ""} /></Field>
            <div className="sm:col-span-2"><Field label={t("address")} htmlFor="billing_address"><SmartTextInput id="billing_address" name="billing_address" mode="address" defaultValue={inv.billing_address ?? ""} maxLength={300} /></Field></div>
            <Field label={t("issueDate")} htmlFor="issue_date"><DatePicker id="issue_date" name="issue_date" defaultValue={inv.issue_date} dateFormat={fmt} /></Field>
            <Field label={t("due")} htmlFor="due_date"><DatePicker id="due_date" name="due_date" defaultValue={inv.due_date} dateFormat={fmt} /></Field>
            <Field label={t("discount")} htmlFor="discount"><MoneyInput id="discount" name="discount" defaultValue={centsToMoneyText(inv.discount_cents)} currency={cur} /></Field>
            <Field label={t("taxRate")} htmlFor="tax_rate"><Input id="tax_rate" name="tax_rate" inputMode="decimal" defaultValue={String(inv.tax_rate)} maxLength={6} /></Field>
            <div className="sm:col-span-2"><Field label={t("notes")} htmlFor="notes"><textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={inv.notes ?? ""} className={ta} /></Field></div>
            <div className="sm:col-span-2"><Field label={t("terms")} htmlFor="terms"><textarea id="terms" name="terms" rows={4} maxLength={3000} defaultValue={inv.terms ?? ""} className={ta} /></Field></div>
            <div className="sm:col-span-2"><Button type="submit">{t("save")}</Button></div>
          </form>
        ) : (
          <div className="space-y-1 text-sm">
            <h2 className="text-base font-semibold">{inv.customer_name}</h2>
            {inv.billing_address && <p className="text-muted">{inv.billing_address}</p>}
            {inv.customer_email && <p className="text-muted">{inv.customer_email}</p>}
            <p>{t("issueDate")}: {formatDateOnly(inv.issue_date, fmt)} · {t("due")}: {formatDateOnly(inv.due_date, fmt)}</p>
            {inv.notes && <p className="whitespace-pre-wrap">{inv.notes}</p>}
            {inv.terms && <p className="whitespace-pre-wrap text-xs text-muted">{inv.terms}</p>}
          </div>
        )}
      </Card>

      {/* Lines */}
      <Card accent="amber" className="space-y-3">
        <h2 className="text-base font-semibold">{t("lines")}</h2>
        {inv.lines.length === 0 && <p className="text-sm text-muted">{t("noLines")}</p>}
        {inv.lines.map((l) =>
          editable ? (
            <form key={l.id} action={updateInvoiceLine.bind(null, id, l.id)} className="grid gap-2 sm:grid-cols-[1fr_5rem_9rem_auto_auto]">
              <Input name="description" defaultValue={l.description} required maxLength={200} aria-label={t("lineDescription")} />
              <Input name="quantity" defaultValue={String(l.quantity)} inputMode="decimal" aria-label={t("qty")} />
              <MoneyInput id={`l-${l.id}`} name="price" defaultValue={centsToMoneyText(l.unit_price_cents)} currency={cur} />
              <Button type="submit" variant="secondary">{t("save")}</Button>
              <Button type="submit" variant="ghost" className="text-danger" formAction={deleteInvoiceLine.bind(null, id, l.id)} formNoValidate>{t("remove")}</Button>
            </form>
          ) : (
            <div key={l.id} className="flex justify-between text-sm"><span>{l.description} × {l.quantity}</span><span>{m(Math.round(l.quantity * l.unit_price_cents))}</span></div>
          ),
        )}
        {editable && (
          <form action={addInvoiceLine.bind(null, id)} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_5rem_9rem_auto]">
            <Input name="description" required maxLength={200} placeholder={t("lineDescription")} aria-label={t("lineDescription")} />
            <Input name="quantity" defaultValue="1" inputMode="decimal" aria-label={t("qty")} />
            <MoneyInput id="l-new" name="price" currency={cur} />
            <Button type="submit">{t("addLine")}</Button>
          </form>
        )}
      </Card>

      {/* Totals */}
      <Card accent="teal">
        <div className="ml-auto max-w-sm space-y-1 text-sm">
          <p className="flex justify-between"><span className="text-muted">{t("subtotal")}</span>{m(x.subtotal_cents)}</p>
          {x.discount_cents > 0 && <p className="flex justify-between"><span className="text-muted">{t("discount")}</span>−{m(x.discount_cents)}</p>}
          {inv.tax_rate > 0 && <p className="flex justify-between"><span className="text-muted">{t("tax")} ({inv.tax_rate}%)</span>{m(x.tax_cents)}</p>}
          <p className="flex justify-between border-t border-line pt-1 text-base font-semibold"><span>{t("total")}</span>{m(x.total_cents)}</p>
          {inv.status !== "draft" && <p className="flex justify-between"><span className="text-muted">{t("paid")}</span>−{m(x.paid_cents)}</p>}
          {inv.status !== "draft" && <p className="flex justify-between text-base font-semibold"><span>{t("balance")}</span>{m(x.balance_cents)}</p>}
        </div>
      </Card>

      {/* Payments */}
      {inv.status !== "draft" && (
        <Card accent="violet" className="space-y-3">
          <h2 className="text-base font-semibold">{t("payments")}</h2>
          {inv.payments.length === 0 && <p className="text-sm text-muted">{t("noPayments")}</p>}
          <ul className="divide-y divide-line text-sm">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{formatDateOnly(p.paid_on, fmt)} · {t(`method.${p.method}`)}{p.reference ? ` · ${p.reference}` : ""}{p.notes ? ` · ${p.notes}` : ""}</span>
                <span className="flex items-center gap-3 font-medium">{m(p.amount_cents)}
                  {can(ctx.role, "settings:write") && <form action={deletePayment.bind(null, id, p.id)}><button type="submit" className="text-xs font-normal text-danger hover:underline">{t("remove")}</button></form>}
                </span>
              </li>
            ))}
          </ul>
          {canWrite && open && (
            <form action={recordPayment.bind(null, id)} className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t("amount")} htmlFor="amount"><MoneyInput id="amount" name="amount" defaultValue={centsToMoneyText(x.balance_cents)} currency={cur} required /></Field>
              <Field label={t("paidOn")} htmlFor="paid_on"><DatePicker id="paid_on" name="paid_on" defaultValue={today} dateFormat={fmt} /></Field>
              <Field label={t("methodLabel")} htmlFor="method">
                <Select id="method" name="method" defaultValue="cash">{PAYMENT_METHODS.map((k) => <option key={k} value={k}>{t(`method.${k}`)}</option>)}</Select>
              </Field>
              <Field label={t("reference")} htmlFor="reference"><Input id="reference" name="reference" maxLength={120} /></Field>
              <div className="sm:col-span-2 lg:col-span-4"><Input name="notes" maxLength={500} placeholder={t("paymentNotes")} aria-label={t("paymentNotes")} /></div>
              <div><Button type="submit">{t("recordPayment")}</Button></div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
