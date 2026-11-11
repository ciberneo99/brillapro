"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Input, Select } from "@/components/ui";
import { CategoryPicker, type CategoryChoice } from "./CategoryPicker";

export type EditableTx = { id: string; date: string; description: string; amountCents: number; categoryId: string | null; notes: string | null };

/** The pencil button of a row, and the "Edit Transaction" window it opens. Changing Type moves the amount between deposits and withdrawals. */
export function EditTransactionDialog({
  tx, choices, action, back,
}: { tx: EditableTx; choices: CategoryChoice[]; action: (formData: FormData) => Promise<void>; back: string }) {
  const t = useTranslations("bank");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = new FormData(e.currentTarget);
    start(async () => { await action(body); setOpen(false); });
  }

  const label = "mb-1 block text-sm font-medium text-muted";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label={t("edit")} aria-haspopup="dialog">
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
      {open && createPortal(
        <dialog
          ref={(el) => { dialog.current = el; if (el && !el.open) { el.showModal(); el.querySelector<HTMLInputElement>("input[name=description]")?.select(); } }} onClose={() => setOpen(false)} onClick={(e) => { if (e.target === dialog.current) setOpen(false); }} aria-labelledby={`edit-${tx.id}`}
          className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40"
        >
          {(
            <form onSubmit={submit} className="space-y-5 p-6">
              <input type="hidden" name="back" value={back} />
              <div className="flex items-start justify-between gap-4">
                <h2 id={`edit-${tx.id}`} className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h2>
                <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label={t("close")}><X className="h-5 w-5" aria-hidden /></button>
              </div>
              <div>
                <label htmlFor={`d-${tx.id}`} className={label}>{t("cols.description")}</label>
                <Input id={`d-${tx.id}`} name="description" defaultValue={tx.description} maxLength={300} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`t-${tx.id}`} className={label}>{t("filters.type")}</label>
                  <Select id={`t-${tx.id}`} name="type" defaultValue={tx.amountCents >= 0 ? "in" : "out"}>
                    <option value="in">{t("income")}</option><option value="out">{t("expense")}</option>
                  </Select>
                </div>
                <div>
                  <label htmlFor={`a-${tx.id}`} className={label}>{t("cols.amount")}</label>
                  <Input id={`a-${tx.id}`} name="amount" inputMode="decimal" defaultValue={(Math.abs(tx.amountCents) / 100).toFixed(2)} required pattern="\s*\d[\d,]*(\.\d{1,2})?\s*" />
                </div>
              </div>
              <div>
                <span className={label}>{t("cols.category")}</span>
                <CategoryPicker choices={choices} name="category_id" defaultValue={tx.categoryId ?? ""} ariaLabel={t("cols.category")} placeholder={t("uncategorized")} extras={[{ value: "", label: t("uncategorized") }]} />
              </div>
              <div>
                <label htmlFor={`n-${tx.id}`} className={label}>{t("cols.date")}</label>
                <Input id={`n-${tx.id}`} type="date" name="tx_date" defaultValue={tx.date} required />
              </div>
              <div>
                <label htmlFor={`o-${tx.id}`} className={label}>{t("notes")}</label>
                <Input id={`o-${tx.id}`} name="notes" defaultValue={tx.notes ?? ""} maxLength={500} placeholder={t("notesPlaceholder")} />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                <Button type="submit" disabled={pending}>{t("save")}</Button>
              </div>
            </form>
          )}
        </dialog>,
        document.body,
      )}
    </>
  );
}
