"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Field, Select } from "@/components/ui";
import { EmailInput } from "@/components/ui/EmailInput";
import { inviteMember, type InviteState } from "@/modules/team/actions";

/** Creates an invitation and shows its link once, to copy and send by whatever channel the owner prefers. */
export function InviteForm({ roles }: { roles: readonly string[] }) {
  const t = useTranslations("team");
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMember, undefined);
  const [copied, setCopied] = useState(false);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* the field is selectable as a fallback */
    }
  }

  return (
    <div className="space-y-3">
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end" noValidate>
        <Field label={t("email")} htmlFor="invite-email"><EmailInput id="invite-email" name="email" required /></Field>
        <Field label={t("role")} htmlFor="invite-role">
          <Select id="invite-role" name="role" defaultValue="employee">
            {roles.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "…" : t("invite")}</Button>
      </form>
      {state?.error && <Alert>{t(`errors.${state.error}`)}</Alert>}
      {state?.link && (
        <Alert tone="success">
          <p className="font-medium">{t("linkReady", { email: state.email ?? "" })}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} className="h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-xs text-fg" aria-label={t("linkLabel")} />
            <Button type="button" variant="secondary" onClick={() => copy(state.link!)}>{copied ? t("copied") : t("copy")}</Button>
            <a
              className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
              href={`mailto:${state.email}?subject=${encodeURIComponent(t("mailSubject"))}&body=${encodeURIComponent(t("mailBody", { link: state.link }))}`}
            >
              {t("sendEmail")}
            </a>
          </div>
          <p className="mt-2 text-xs">{t("linkNote")}</p>
        </Alert>
      )}
    </div>
  );
}
