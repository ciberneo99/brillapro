"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Phone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Card, Field, Input, Select, cn } from "@/components/ui";
import { EmployeeFields } from "./EmployeeFields";
import { formatPhone } from "@/lib/phone";

type Person = {
  id: string; user_id: string | null; full_name: string; phone: string | null; phone_2: string | null; email: string | null; notes: string | null; is_active: boolean;
  address: string | null; city: string | null; state: string | null; zip_code: string | null;
};

/**
 * One employee as a vertical card that never changes size: name, status and phone(s). The pencil opens the edit form
 * in a floating window, so the cards around it do not move. The page gives each card a key built from its data, so after
 * a save the window is gone and the card shows the new data.
 */
export function EmployeeCard({
  employee: e, members, canEdit, saveAction, activeAction,
}: {
  employee: Person; members: { user_id: string; label: string }[]; canEdit: boolean;
  saveAction: (formData: FormData) => Promise<void>; activeAction: () => Promise<void>;
}) {
  const t = useTranslations("employees");
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDialogElement | null>(null);
  const initials = e.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const phones = [e.phone, e.phone_2].filter((p): p is string => Boolean(p));

  return (
    <Card accent={e.is_active ? "teal" : undefined} className={cn("flex flex-col", !e.is_active && "opacity-70")}>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-base font-semibold text-primary" aria-hidden>{initials || "?"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{e.full_name}</p>
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", e.is_active ? "text-success" : "text-muted")}>
            <span className={cn("h-2 w-2 rounded-full", e.is_active ? "bg-success" : "bg-line")} aria-hidden />{e.is_active ? t("active") : t("inactive")}
          </span>
        </div>
        {canEdit && (
          <button
            type="button" onClick={() => setEditing(true)} aria-haspopup="dialog" aria-label={t("edit")} title={t("edit")}
            className="rounded-lg p-2 text-muted hover:bg-primary-soft hover:text-primary"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-4 space-y-1 text-sm">
        {phones.length === 0 ? (
          <p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-muted" aria-hidden /><span className="text-muted">—</span></p>
        ) : (
          phones.map((p) => (
            <p key={p} className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <a href={`tel:${p}`} className="hover:text-primary hover:underline">{formatPhone(p)}</a>
            </p>
          ))
        )}
      </div>

      {editing && createPortal(
        <dialog
          ref={(el) => { ref.current = el; if (el && !el.open) el.showModal(); }}
          onClose={() => setEditing(false)} onClick={(ev) => { if (ev.target === ref.current) setEditing(false); }} aria-labelledby={`edit-${e.id}`}
          className="m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40"
        >
          <div className="space-y-3 p-6">
            <div className="mb-1 flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-base font-semibold text-primary" aria-hidden>{initials || "?"}</span>
              <h2 id={`edit-${e.id}`} className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">{e.full_name}</h2>
              <button type="button" onClick={() => setEditing(false)} aria-label={t("cancel")} title={t("cancel")} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <form action={saveAction} className="space-y-3">
              <EmployeeFields prefix={e.id} values={e} />
              <Field label={t("login")} htmlFor={`u-${e.id}`} hint={t("loginHelp")}>
                <Select id={`u-${e.id}`} name="user_id" defaultValue={e.user_id ?? ""}>
                  <option value="">{t("noLogin")}</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.label}</option>)}
                </Select>
              </Field>
              <Input name="notes" defaultValue={e.notes ?? ""} maxLength={1000} placeholder={t("notes")} aria-label={t("notes")} />
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setEditing(false)}>{t("cancel")}</Button>
                <Button type="submit">{t("save")}</Button>
              </div>
            </form>
            <form action={activeAction} className="border-t border-line pt-3">
              <Button type="submit" variant="ghost" className="w-full">{e.is_active ? t("deactivate") : t("activate")}</Button>
            </form>
          </div>
        </dialog>,
        document.body,
      )}
    </Card>
  );
}
