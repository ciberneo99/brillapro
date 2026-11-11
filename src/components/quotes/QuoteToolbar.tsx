"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, Copy, Download, Mail, Printer, Save, Trash2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Field, Select, cn } from "@/components/ui";
import { acceptQuote, declineQuote, deleteQuote, duplicateQuote, markQuoteSent } from "@/modules/quotes/actions";

type Props = {
  id: string; draft: boolean; open: boolean; resend: boolean; canWrite: boolean; mailto: string | null;
  options: { id: string; label: string }[];
};

const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Top-right of the quote page: Back, Mark accepted, and the Actions menu (same pattern as the invoice). */
export function QuoteToolbar(p: Props) {
  const t = useTranslations("quotes");
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
    if (!p.resend) { const r = await markQuoteSent(p.id); if (!r.ok) { setFailed(true); return; } }
    setMenu(false);
    window.open(`/quotes/${p.id}/pdf`, "_blank", "noopener");
    window.location.href = p.mailto;
  });

  const print = () => {
    setMenu(false);
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    f.src = `/quotes/${p.id}/pdf`;
    f.onload = () => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60_000); };
    document.body.appendChild(f);
  };

  const confirmThen = (msg: string) => (e: React.FormEvent) => { if (!window.confirm(msg)) e.preventDefault(); };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link href="/quotes" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t("back")}
      </Link>

      {p.canWrite && p.open && (
        <Button type="button" variant="secondary" onClick={() => dialog.current?.showModal()}>
          <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden />{t("markAccepted")}
        </Button>
      )}

      <div ref={root} className="relative">
        <Button type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          {t("toolbar.actions")}<ChevronDown className="ml-1 h-4 w-4" aria-hidden />
        </Button>
        {menu && (
          <div role="menu" className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
            {p.canWrite && p.draft && (
              <button type="submit" form="quote-form" role="menuitem" className={item} onClick={() => setMenu(false)}><Save className="h-4 w-4" aria-hidden />{t("toolbar.save")}</button>
            )}
            {p.canWrite && p.open && (
              <button type="button" role="menuitem" className={item} disabled={!p.mailto || pending} onClick={send} title={p.mailto ? undefined : t("noEmail")}>
                <Mail className="h-4 w-4" aria-hidden />{p.resend ? t("emailAgain") : t("sendEmail")}
              </button>
            )}
            {p.canWrite && p.draft && <p className="px-3 pb-1 text-xs text-muted">{t("editor.saveFirst")}</p>}
            {failed && <p className="px-3 pb-1 text-xs text-danger">{t("sendFailed")}</p>}
            {p.canWrite && (
              <form action={duplicateQuote.bind(null, p.id)}><button type="submit" role="menuitem" className={item}><Copy className="h-4 w-4" aria-hidden />{t("duplicate")}</button></form>
            )}
            <button type="button" role="menuitem" className={item} onClick={print}><Printer className="h-4 w-4" aria-hidden />{t("toolbar.print")}</button>
            <a role="menuitem" className={item} href={`/quotes/${p.id}/pdf?download=1`} onClick={() => setMenu(false)}><Download className="h-4 w-4" aria-hidden />{t("toolbar.download")}</a>
            {p.canWrite && p.open && (
              <form action={declineQuote.bind(null, p.id)} onSubmit={confirmThen(t("toolbar.confirmDecline"))}>
                <button type="submit" role="menuitem" className={cn(item, "text-danger")}><XCircle className="h-4 w-4" aria-hidden />{t("markDeclined")}</button>
              </form>
            )}
            {p.canWrite && p.draft && (
              <form action={deleteQuote.bind(null, p.id)} onSubmit={confirmThen(t("toolbar.confirmDelete"))}>
                <button type="submit" role="menuitem" className={cn(item, "border-t border-line text-danger")}><Trash2 className="h-4 w-4" aria-hidden />{t("toolbar.delete")}</button>
              </form>
            )}
          </div>
        )}
      </div>

      <dialog ref={dialog} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40">
        <form action={acceptQuote.bind(null, p.id)} className="space-y-4 p-5">
          <h2 className="text-base font-semibold">{t("markAccepted")}</h2>
          {p.options.length > 0 && (
            <Field label={t("acceptedOption")} htmlFor="option_id">
              <Select id="option_id" name="option_id" required defaultValue="">
                <option value="" disabled>{t("chooseOptionPlaceholder")}</option>
                {p.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>{t("toolbar.cancel")}</Button>
            <Button type="submit">{t("markAccepted")}</Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
