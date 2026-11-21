"use client";

import { useState } from "react";
import { Pencil, Phone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Card, Field, Input, Select, cn } from "@/components/ui";
import { EmailInput } from "@/components/ui/EmailInput";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { SmartTextInput } from "@/components/ui/SmartTextInput";
import { formatPhone } from "@/lib/phone";

type Person = { id: string; user_id: string | null; full_name: string; phone: string | null; email: string | null; notes: string | null; is_active: boolean };

/**
 * One employee as a vertical card. Closed by default: just the name, status and phone, with an Edit button.
 * Edit opens the form in the same card. The page gives each card a key built from its data, so after a save it
 * comes back closed (read-only).
 */
export function EmployeeCard({
  employee: e, members, canEdit, saveAction, activeAction,
}: {
  employee: Person; members: { user_id: string; label: string }[]; canEdit: boolean;
  saveAction: (formData: FormData) => Promise<void>; activeAction: () => Promise<void>;
}) {
  const t = useTranslations("employees");
  const [editing, setEditing] = useState(false);
  const initials = e.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

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
            type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} aria-label={editing ? t("cancel") : t("edit")} title={editing ? t("cancel") : t("edit")}
            className="rounded-lg p-2 text-muted hover:bg-primary-soft hover:text-primary"
          >
            {editing ? <X className="h-4 w-4" aria-hidden /> : <Pencil className="h-4 w-4" aria-hidden />}
          </button>
        )}
      </div>

      {!editing ? (
        <p className="mt-4 flex items-center gap-2 text-sm">
          <Phone className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          {e.phone ? <a href={`tel:${e.phone}`} className="hover:text-primary hover:underline">{formatPhone(e.phone)}</a> : <span className="text-muted">—</span>}
        </p>
      ) : (
        <>
          <form action={saveAction} className="mt-4 flex flex-1 flex-col gap-3">
            <Field label={t("name")} htmlFor={`n-${e.id}`}><SmartTextInput id={`n-${e.id}`} name="full_name" mode="name" defaultValue={e.full_name} required maxLength={120} /></Field>
            <Field label={t("phone")} htmlFor={`p-${e.id}`}><PhoneInput id={`p-${e.id}`} name="phone" defaultValue={e.phone ?? ""} /></Field>
            <Field label={t("email")} htmlFor={`e-${e.id}`}><EmailInput id={`e-${e.id}`} name="email" defaultValue={e.email ?? ""} /></Field>
            <Field label={t("login")} htmlFor={`u-${e.id}`} hint={t("loginHelp")}>
              <Select id={`u-${e.id}`} name="user_id" defaultValue={e.user_id ?? ""}>
                <option value="">{t("noLogin")}</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.label}</option>)}
              </Select>
            </Field>
            <Input name="notes" defaultValue={e.notes ?? ""} maxLength={1000} placeholder={t("notes")} aria-label={t("notes")} />
            <div className="mt-auto flex gap-2 pt-1">
              <Button type="submit" variant="secondary" className="flex-1">{t("save")}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{t("cancel")}</Button>
            </div>
          </form>
          <form action={activeAction} className="mt-1">
            <Button type="submit" variant="ghost" className="w-full">{e.is_active ? t("deactivate") : t("activate")}</Button>
          </form>
        </>
      )}
    </Card>
  );
}
