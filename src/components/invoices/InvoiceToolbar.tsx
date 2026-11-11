"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Ban, ChevronDown, Copy, Download, Mail, Plus, Printer, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, cn } from "@/components/ui";
import { deleteInvoice, duplicateInvoice, markInvoiceSent, recordPayment, voidInvoice } from "@/modules/invoices/actions";
import { PaymentFields } from "./PaymentFields";

type Props = {
  id: string; draft: boolean; canWrite: boolean; canVoid: boolean; canPay: boolean; mailto: string | null; resend: boolean;
  balanceText: string; today: string; currency: string; dateFormat: string;
};

const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

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
      <Link href="/invoices" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t("back")}
      </Link>

      {p.canWrite && (
        <Button type="button" variant="secondary" disabled={!p.canPay} title={p.canPay ? undefined : t("toolbar.paymentNotAvailable")} onClick={() => dialog.current?.showModal()}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />{t("toolbar.addPayment")}
        </Button>
      )}

      <div ref={root} className="relative">
        <Button type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          {t("toolbar.actions")}<ChevronDown className="ml-1 h-4 w-4" aria-hidden />
        </Button>
        {menu && (
          <div role="menu" className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
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
            <a role="menuitem" className={item} href={`/invoices/${p.id}/pdf?download=1`} onClick={() => setMenu(false)}><Download className="h-4 w-4" aria-hidden />{t("toolbar.download")}</a>
            {p.canWrite && p.canVoid && (
              <form action={voidInvoice.bind(null, p.id)} onSubmit={confirmThen(t("toolbar.confirmVoid"))}>
                <button type="submit" role="menuitem" className={cn(item, "text-danger")}><Ban className="h-4 w-4" aria-hidden />{t("void")}</button>
              </form>
            )}
            {p.canWrite && p.draft && (
              <form action={deleteInvoice.bind(null, p.id)} onSubmit={confirmThen(t("toolbar.confirmDelete"))}>
                <button type="submit" role="menuitem" className={cn(item, "border-t border-line text-danger")}><Trash2 className="h-4 w-4" aria-hidden />{t("toolbar.delete")}</button>
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
