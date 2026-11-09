"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert, Button, Field, Input, Select, Card } from "@/components/ui";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmailInput } from "@/components/ui/EmailInput";
import { SmartTextInput } from "@/components/ui/SmartTextInput";
import type { TextMode } from "@/lib/text";
import type { CustomerFormState } from "@/modules/customers/actions";
import { FREQUENCIES, PROPERTY_TYPES } from "@/modules/customers/schema";

export type CustomerFormValues = Record<string, string>;

export function CustomerForm({
  action, values = {}, cancelHref, submitLabel, dateFormat,
}: {
  dateFormat?: string;
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  values?: CustomerFormValues;
  cancelHref: string;
  submitLabel: string;
}) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(action, undefined);
  const v = (k: string) => values[k] ?? "";
  const bad = (k: string) => state?.fields?.includes(k);

  const input = (name: string, label: string, opts: { type?: string; autoComplete?: string; inputMode?: "numeric" | "decimal"; hint?: string; smart?: TextMode } = {}) => (
    <Field label={label} hint={opts.hint} htmlFor={name}>
      {opts.smart ? (
        <SmartTextInput id={name} name={name} mode={opts.smart} defaultValue={v(name)} autoComplete={opts.autoComplete} invalid={bad(name)} />
      ) : opts.type === "tel" ? (
        <PhoneInput id={name} name={name} defaultValue={v(name)} invalid={bad(name)} />
      ) : opts.type === "email" ? (
        <EmailInput id={name} name={name} defaultValue={v(name)} invalid={bad(name)} />
      ) : opts.type === "date" ? (
        <DatePicker id={name} name={name} defaultValue={v(name)} dateFormat={dateFormat} />
      ) : (
        <Input
          id={name} name={name} type={opts.type ?? "text"} defaultValue={v(name)} autoComplete={opts.autoComplete} inputMode={opts.inputMode}
          aria-invalid={bad(name) || undefined} className={bad(name) ? "border-danger" : undefined}
        />
      )}
    </Field>
  );
  const area = (name: string, label: string) => (
    <Field label={label} htmlFor={name}>
      <textarea id={name} name={name} rows={3} defaultValue={v(name)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg" />
    </Field>
  );

  const message =
    state?.error === "notAllowed" ? tc("notAllowed")
    : state?.error === "identityRequired" ? t("errors.identityRequired")
    : state?.error === "invalid" ? t("errors.invalid")
    : state?.error ? t("errors.saveFailed") : null;

  return (
    <form action={formAction} className="space-y-6">
      {message && <Alert>{message}</Alert>}

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">{t("form.contact")}</h2>
        <p className="-mt-2 text-xs text-muted">{t("form.identityHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {input("first_name", t("form.firstName"), { autoComplete: "off", smart: "name" })}
          {input("last_name", t("form.lastName"), { autoComplete: "off", smart: "name" })}
          <div className="sm:col-span-2">{input("company_name", t("form.companyName"))}</div>
          {input("email", t("form.email"), { type: "email" })}
          {input("phone", t("form.phone"), { type: "tel" })}
          {input("secondary_phone", t("form.secondaryPhone"), { type: "tel" })}
          {input("customer_since", t("form.customerSince"), { type: "date" })}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">{t("form.property")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{input("service_address", t("form.serviceAddress"), { smart: "address" })}</div>
          <div className="sm:col-span-2">{input("billing_address", t("form.billingAddress"), { smart: "address" })}</div>
          {input("city", t("form.city"), { smart: "address" })}
          {input("state", t("form.state"), { smart: "state" })}
          {input("zip_code", t("form.zipCode"), { inputMode: "numeric" })}
          <Field label={t("form.propertyType")} htmlFor="property_type">
            <Select id="property_type" name="property_type" defaultValue={v("property_type")}>
              <option value="">{t("form.choose")}</option>
              {PROPERTY_TYPES.map((p) => <option key={p} value={p}>{t(`propertyType.${p}`)}</option>)}
            </Select>
          </Field>
          {input("square_footage", t("form.squareFootage"), { inputMode: "numeric" })}
          {input("bedrooms", t("form.bedrooms"), { inputMode: "numeric" })}
          {input("bathrooms", t("form.bathrooms"), { inputMode: "decimal", hint: "1, 1.5, 2…" })}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">{t("form.service")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("form.frequency")} htmlFor="cleaning_frequency">
            <Select id="cleaning_frequency" name="cleaning_frequency" defaultValue={v("cleaning_frequency")}>
              <option value="">{t("form.choose")}</option>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{t(`frequency.${f}`)}</option>)}
            </Select>
          </Field>
          {input("preferred_service", t("form.preferredService"))}
          {input("estimated_price", t("form.estimatedPrice"), { inputMode: "decimal", hint: "USD" })}
          {input("pets", t("form.pets"))}
          <div className="sm:col-span-2">{area("access_instructions", t("form.accessInstructions"))}</div>
          <div className="sm:col-span-2">{area("special_instructions", t("form.specialInstructions"))}</div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">{t("form.notesSection")}</h2>
        {area("notes", t("form.notes"))}
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? tc("loading") : submitLabel}</Button>
        <Link href={cancelHref} className="text-sm text-muted hover:text-fg">{tc("cancel")}</Link>
      </div>
    </form>
  );
}
