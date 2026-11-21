import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui";
import { InvoiceEditor } from "@/components/invoices/InvoiceEditor";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { BillToDetails } from "@/components/invoices/BillToDetails";
import { InvoiceToolbar } from "@/components/invoices/InvoiceToolbar";
import { PaymentHistory } from "@/components/invoices/PaymentHistory";
import { SheetHeader } from "@/components/invoices/SheetHeader";
import { todayIso } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { fullAddress } from "@/lib/business";
import { logoUrl } from "@/lib/logo-server";
import { centsToMoneyText, formatMoney, quoteNumber } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/modules/customers/schema";
import { saveInvoiceDraft } from "@/modules/invoices/actions";
import { getInvoice, getInvoiceSettings } from "@/modules/invoices/queries";
import { SavedToast } from "@/components/ui/SavedToast";

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
  const te = await getTranslations("invoices.editor");
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
  const company = {
    name: ctx.tenant.name, address: fullAddress(ctx.settings), website: ctx.settings.website, phone: ctx.settings.phone, email: ctx.settings.email, taxId: ctx.settings.tax_id,
    logoUrl: await logoUrl(ctx.settings.logo_path),
  };

  const { data: cust } = await (await createClient()).from("customers").select("phone,company_name").eq("id", inv.customer_id).maybeSingle();
  const customerPhone = inv.customer_phone ?? (inv.status === "draft" ? cust?.phone ?? null : null); // an issued invoice keeps the phone it had
  const customerCompany = cust?.company_name || null;
  let customers: { id: string; name: string; email: string | null; phone: string | null; address: string | null; company: string | null }[] = [];
  if (editable) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("customers").select("id,first_name,last_name,company_name,email,phone,billing_address,service_address,city,state,zip_code")
      .neq("status", "archived").order("first_name").limit(1000);
    customers = (data ?? []).map((c) => ({
      id: c.id, name: displayName(c), email: c.email, phone: c.phone, company: c.company_name || null,
      address: [c.billing_address || c.service_address, c.city, [c.state, c.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
    }));
  }

  const mailto = inv.customer_email
    ? `mailto:${encodeURIComponent(inv.customer_email)}?subject=${encodeURIComponent(t("mail.subject", { number: num, business: ctx.tenant.name }))}&body=${encodeURIComponent(
        t("mail.body", { name: inv.customer_name, number: num, total: m(x.total_cents), date: formatDateOnly(inv.due_date, fmt), business: ctx.tenant.name }),
      )}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">{num} <InvoiceStatusBadge status={inv.display_status} /></h1>
          <p className="mt-1 text-sm text-muted">
            <Link href={`/customers/${inv.customer_id}`} className="text-primary hover:underline">{inv.customer_name}</Link>
            {" · "}{t("due")} {formatDateOnly(inv.due_date, fmt)}
            {inv.job_id && can(ctx.role, "jobs:read") && <> · <Link href={`/jobs/${inv.job_id}`} className="text-primary hover:underline">{t("fromJob")}</Link></>}
          </p>
        </div>
        <InvoiceToolbar
          id={id} status={inv.status} draft={draft} canWrite={canWrite} canVoid={inv.status === "sent" && x.paid_cents === 0} canPay={open} mailto={mailto} resend={!draft}
          balanceText={centsToMoneyText(x.balance_cents)} today={today} currency={cur} dateFormat={fmt}
        />
      </div>

      {sp.error && sp.error !== "invalid" && <Alert>{t(sp.error === "payment" ? "paymentError" : sp.error === "issue" ? "issueError" : "voidError")}</Alert>}
      {sp.saved && <SavedToast>{t("saved")}</SavedToast>}
      {!draft && <p className="text-sm text-muted">{t("lockedNote")}</p>}

      {editable ? (
        <InvoiceEditor
          number={num} company={company} customers={customers} currency={cur} dateFormat={fmt} error={sp.error === "invalid"}
          action={saveInvoiceDraft.bind(null, id)}
          initial={{
            customerId: inv.customer_id, customerName: inv.customer_name, customerEmail: inv.customer_email ?? "", customerPhone: customerPhone ?? "", customerCompany: customerCompany ?? "", billingAddress: inv.billing_address ?? "",
            issueDate: inv.issue_date, dueDate: inv.due_date, discount: centsToMoneyText(inv.discount_cents), taxRate: String(inv.tax_rate),
            notes: inv.notes ?? "", terms: inv.terms ?? "",
            lines: inv.lines.map((l) => ({ description: l.description, quantity: String(l.quantity), price: centsToMoneyText(l.unit_price_cents) })),
          }}
        />
      ) : (
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-8">
          <SheetHeader company={company} alt={te("logoAlt")}>
            <div className="space-y-1 text-sm">
              <p className="text-3xl font-bold tracking-tight text-primary">{te("invoice")}</p>
              <p className="font-semibold">{num}</p>
              <p className="text-muted">{te("date")}: {formatDateOnly(inv.issue_date, fmt)}</p>
              <p className="text-muted">{te("dueDate")}: {formatDateOnly(inv.due_date, fmt)}</p>
            </div>
          </SheetHeader>
          <div className="grid gap-4 border-b border-line py-6 md:grid-cols-[minmax(0,22rem)_1fr]">
            <h2 className="text-base font-bold uppercase tracking-tight">{te("billTo")}</h2>
            <BillToDetails name={inv.customer_name} company={customerCompany} address={inv.billing_address} email={inv.customer_email} phone={customerPhone} />
          </div>
          <div className="py-6">
            <div className="hidden grid-cols-[minmax(0,1fr)_5rem_8rem_7rem] gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white md:grid">
              <span>{te("description")}</span><span className="text-right">{te("qty")}</span><span className="text-right">{te("rate")}</span><span className="text-right">{te("amount")}</span>
            </div>
            {inv.lines.length === 0 && <p className="py-3 text-sm text-muted">{t("noLines")}</p>}
            <ul className="divide-y divide-line text-sm">
              {inv.lines.map((l) => (
                <li key={l.id} className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 px-3 py-3 md:grid-cols-[minmax(0,1fr)_5rem_8rem_7rem]">
                  <span>{l.description}</span>
                  <span className="text-right text-muted md:order-none">{l.quantity}</span>
                  <span className="hidden text-right md:block">{m(l.unit_price_cents)}</span>
                  <span className="text-right font-semibold">{m(Math.round(l.quantity * l.unit_price_cents))}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-6 border-t border-line pt-6 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              {inv.notes && <div><h3 className="font-semibold">{te("notes")}</h3><p className="whitespace-pre-wrap text-muted">{inv.notes}</p></div>}
              {inv.terms && <div><h3 className="font-semibold">{te("terms")}</h3><p className="whitespace-pre-wrap text-xs text-muted">{inv.terms}</p></div>}
            </div>
            <dl className="space-y-1.5 text-sm md:ml-auto md:w-full md:max-w-xs">
              <div className="flex justify-between"><dt className="text-muted">{t("subtotal")}</dt><dd>{m(x.subtotal_cents)}</dd></div>
              {x.discount_cents > 0 && <div className="flex justify-between"><dt className="text-muted">{t("discount")}</dt><dd>−{m(x.discount_cents)}</dd></div>}
              {inv.tax_rate > 0 && <div className="flex justify-between"><dt className="text-muted">{t("tax")} ({inv.tax_rate}%)</dt><dd>{m(x.tax_cents)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>{t("total")}</dt><dd>{m(x.total_cents)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t("paid")}</dt><dd>−{m(x.paid_cents)}</dd></div>
              <div className="flex justify-between rounded-lg bg-primary px-3 py-2 text-base font-semibold text-white"><dt>{t("balance")}</dt><dd>{m(x.balance_cents)}</dd></div>
            </dl>
          </div>
          {inv.payments.length > 0 && (
            <div className="pt-6">
              <PaymentHistory
                invoiceId={id} currency={cur} dateFormat={fmt} canManage={can(ctx.role, "settings:write") && inv.status === "sent"}
                payments={inv.payments.map((p) => ({ ...p, paid_label: formatDateOnly(p.paid_on, fmt) }))}
              />
            </div>
          )}
          <p className="pt-8 text-center text-sm font-semibold text-muted">{te("thanks")}</p>
        </div>
      )}
    </div>
  );
}
