"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Input } from "@/components/ui";
import { EmployeeFields } from "./EmployeeFields";

/**
 * The dashed "Add employee" card. It is one compact button; clicking it opens a window with the complete form
 * (name, phone + optional extra phone, email, address, notes). The page gives it a key that changes when an employee
 * is added, so after saving the window is gone and the card is closed again.
 */
export function AddEmployeeCard({ action }: { action: (formData: FormData) => Promise<void> }) {
  const t = useTranslations("employees");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement | null>(null);

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="add-card flex items-center gap-3 rounded-xl p-5 text-left hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg"><UserPlus className="h-6 w-6" aria-hidden /></span>
        <span className="text-base font-semibold">{t("add")}</span>
      </button>

      {open && createPortal(
        <dialog
          ref={(el) => { ref.current = el; if (el && !el.open) el.showModal(); }}
          onClose={() => setOpen(false)} onClick={(e) => { if (e.target === ref.current) setOpen(false); }} aria-labelledby="add-employee-title"
          className="m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40"
        >
          <form action={action} className="space-y-3 p-6">
            <div className="mb-1 flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg"><UserPlus className="h-6 w-6" aria-hidden /></span>
              <h2 id="add-employee-title" className="flex-1 text-xl font-semibold tracking-tight">{t("add")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("cancel")} title={t("cancel")} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <EmployeeFields prefix="new" />
            <Input name="notes" maxLength={1000} placeholder={t("notes")} aria-label={t("notes")} />
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t("cancel")}</Button>
              <Button type="submit">{t("addButton")}</Button>
            </div>
          </form>
        </dialog>,
        document.body,
      )}
    </>
  );
}
