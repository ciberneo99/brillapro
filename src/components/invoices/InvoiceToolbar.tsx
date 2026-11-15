"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Ban, ChevronDown, Copy, Download, Eye, Mail, Plus, Printer, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, cn } from "@/components/ui";
import { deleteInvoice, duplicateInvoice, markInvoiceSent, recordPayment, voidInvoice } from "@/modules/invoices/actions";
import { InvoiceStatusMenu } from "./InvoiceStatusMenu";
import { PaymentFields } from "./PaymentFields";

type Props = {
  id: string; status: string; draft: boolean; canWrite: boolean; canVoid: boolean; canPay: boolean; mailto: string | null; resend: boolean;
  balanceText: string; today: string; currency: string; dateFormat: string;
};

const item = "bp-fx-item flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";

/** Top-right of the invoice page: Back, Add payment, and the Actions menu. */
export function InvoiceToolbar(p: Props) {
  const t = useTranslations("invoices");
  const [menu, setMenu] = useState(false);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setMenu(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [menu]);

  const send = () => start(async () => {
    if (!p.mailto) return;
    if (!p.resend) { const r = await markInvoiceSent(p.id); if (!r.ok) { setFailed(true); return; } }
    setMenu(false);
    window.open(`/invoices/${p.id}/pdf`, "_blank", "noopener");
    window.location.href = p.mailto;
  });

  const print = () => {
    setMenu(false);
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    f.src = `/invoices/${p.id}/pdf`;
    f.onload = () => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60_000); };
    document.body.appendChild(f);
  };

  const confirmThen = (msg: string) => (e: React.FormEvent) => { if (!window.confirm(msg)) e.preventDefault(); };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link href="/invoices" className="bp-fx inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-primary hover:bg-primary-soft">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t("back")}
      </Link>

      {p.canWrite && <InvoiceStatusMenu id={p.id} status={p.status} />}

      {p.canWrite && (
        <span className="group relative inline-flex">
          <Button type="button" variant="secondary" disabled={!p.canPay} aria-describedby={p.canPay ? undefined : "pay-unavailable"} onClick={() => dialog.current?.showModal()}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />{t("toolbar.addPayment")}
          </Button>
          {!p.canPay && (
            <span
              id="pay-unavailable" role="tooltip"
              className="pointer-events-none absolute right-0 top-full z-30 mt-3 w-80 max-w-[80vw] translate-y-1 rounded-xl bg-orange-500 px-4 py-3 text-left text-base font-medium leading-snug text-white opacity-0 shadow-[0_0_0_1px_rgb(251_146_60),0_10px_28px_-6px_rgb(249_115_22/0.75),0_0_26px_2px_rgb(249_115_22/0.55)] transition duration-150 group-hover:translate-y-0 group-hover:opacity-100"
            >
              {t("toolbar.paymentNotAvailable")}
            </span>
          )}
        </span>
      )}

      <div ref={root} className="relative">
        <Button type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          {t("toolbar.actions")}<ChevronDown className="ml-1 h-4 w-4" aria-hidden />
        </Button>
        {menu && (
          <div role="menu" className="absolute right-0 z-30 mt-1 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
            {p.canWrite && p.draft && (
              <button type="submit" form="invoice-form" role="menuitem" className={item} onClick={() => setMenu(false)}><Save className="h-4 w-4" aria-hidden />{t("toolbar.save")}</button>
            )}
            {p.canWrite && (p.draft || p.resend) && (
              <button type="button" role="menuitem" className={item} disabled={!p.mailto || pending} onClick={send} title={p.mailto ? undefined : t("noEmail")}>
                <Mail className="h-4 w-4" aria-hidden />{p.resend ? t("emailAgain") : t("sendEmail")}
              </button>
            )}
            {p.canWrite && p.draft && <p className="px-3 pb-1 text-xs text-muted">{t("editor.saveFirst")}</p>}
            {failed && <p className="px-3 pb-1 text-xs text-danger">{t("sendFailed")}</p>}
            {p.canWrite && (
              <form action={duplicateInvoice.bind(null, p.id)}><button type="submit" role="menuitem" className={item}><Copy className="h-4 w-4" aria-hidden />{t("duplicate")}</button></form>
            )}
            <button type="button" role="menuitem" className={item} onClick={print}><Printer className="h-4 w-4" aria-hidden />{t("toolbar.print")}</button>
            <a role="menuitem" className={item} href={`/invoices/${p.id}/pdf`} target="_blank" rel="noopener" onClick={() => setMenu(false)}><Eye className="h-4 w-4" aria-hidden />{t("toolbar.preview")}</a>
            <a role="menuitem" className={item} href={`/invoices/${p.id}/pdf?download=1`} onClick={() => setMenu(false)}><Download className="h-4 w-4" aria-hidden />{t("toolbar.download")}</a>
            {p.canWrite && p.canVoid && (
              <form action={voidInvoice.bind(null, p.id)} onSubmit={confirmThen(t("toolbar.confirmVoid"))}>
                <button type="submit" role="menuitem" className={cn(item, "text-danger hover:text-danger")}><Ban className="h-4 w-4" aria-hidden />{t("void")}</button>
              </form>
            )}
            {p.canWrite && p.draft && (
              <form action={deleteInvoice.bind(null, p.id)} onSubmit={confirmThen(t("toolbar.confirmDelete"))}>
                <button type="submit" role="menuitem" className={cn(item, "text-danger hover:text-danger")}><Trash2 className="h-4 w-4" aria-hidden />{t("toolbar.delete")}</button>
              </form>
            )}
          </div>
        )}
      </div>

      <dialog ref={dialog} className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40">
        <form action={recordPayment.bind(null, p.id)} className="space-y-4 p-5">
          <h2 className="text-base font-semibold">{t("toolbar.addPayment")}</h2>
          <PaymentFields idp="add" v={{ amount: p.balanceText, paid_on: p.today, method: "cash", reference: "", notes: "" }} currency={p.currency} dateFormat={p.dateFormat} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>{t("toolbar.cancel")}</Button>
            <Button type="submit">{t("recordPayment")}</Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
