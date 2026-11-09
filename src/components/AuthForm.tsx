"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Field, Input } from "@/components/ui";
import { EmailInput } from "@/components/ui/EmailInput";
import type { FormState } from "@/app/(auth)/actions";

type FieldDef = { name: string; type: string; label: string; autoComplete?: string; hint?: string; placeholder?: string };

/** Generic server-action form: fields, submit button, translated error / success states. */
export function AuthForm({
  action, fields, submitLabel, doneMessage, errorNamespace = "auth",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: FieldDef[];
  submitLabel: string;
  doneMessage?: string;
  errorNamespace?: "auth" | "onboarding" | "common";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const tAuth = useTranslations("auth");
  const tOnb = useTranslations("onboarding");
  const tCommon = useTranslations("common");

  function errorText(key: string) {
    // Keys may live in auth, onboarding or common; fall back to the generic message.
    const bundles = errorNamespace === "onboarding" ? [tOnb, tCommon, tAuth] : [tAuth, tOnb, tCommon];
    for (const t of bundles) if (t.has(key as never)) return t(key as never);
    return tCommon("genericError");
  }

  if (state?.done && doneMessage) return <Alert tone="success">{doneMessage}</Alert>;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.error && <Alert>{errorText(state.error)}</Alert>}
      {fields.map((f) => (
        <Field key={f.name} label={f.label} hint={f.hint} htmlFor={f.name}>
          {f.type === "email" ? (
            <EmailInput id={f.name} name={f.name} autoComplete={f.autoComplete} required />
          ) : (
            <Input id={f.name} name={f.name} type={f.type} autoComplete={f.autoComplete} placeholder={f.placeholder} required />
          )}
        </Field>
      ))}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? tCommon("loading") : submitLabel}
      </Button>
    </form>
  );
}
