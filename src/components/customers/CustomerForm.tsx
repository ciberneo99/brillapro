"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, Button, Field, Input, Select, Card, SectionTitle } from "@/components/ui";
import { GroupedNumberInput, MoneyInput, SmartTextarea, ZipInput } from "@/components/ui/fields";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmailInput } from "@/components/ui/EmailInput";
import { SmartTextInput } from "@/components/ui/SmartTextInput";
import type { TextMode } from "@/lib/text";
import type { CustomerFormState } from "@/modules/customers/actions";
import { mapsUrl } from "@/lib/maps";
import { FREQUENCIES, PHONE_LABELS, PROPERTY_TYPES } from "@/modules/customers/schema";

export type CustomerFormValues = Record<string, string>;

export function CustomerForm({
  action, values = {}, cancelHref, submitLabel, dateFormat, currency,
}: {
  currency?: string;
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
  const [showSecond, setShowSecond] = useState(Boolean(values.secondary_phone));
  const openMap = () => {
    const get = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? "";
    const q = [get("service_address"), get("city"), [get("state"), get("zip_code")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (q) window.open(mapsUrl(q), "_blank", "noopener,noreferrer");
  };
  const labelSelect = (name: string) => (
    <div className="w-28 shrink-0"><Select name={name} defaultValue={v(name) || "cell"} aria-label={t("form.phoneType")}>
      {PHONE_LABELS.map((l) => <option key={l} value={l}>{t(`phoneLabel.${l}`)}</option>)}
    </Select></div>
  );

  const input = (name: string, label: string, opts: { type?: string; autoComplete?: string; inputMode?: "numeric" | "decimal"; hint?: string; smart?: TextMode; kind?: "zip" | "money" | "grouped" } = {}) => (
    <Field label={label} hint={opts.hint} htmlFor={name}>
      {opts.kind === "zip" ? (
        <ZipInput id={name} name={name} defaultValue={v(name)} invalid={bad(name)} />
      ) : opts.kind === "money" ? (
        <MoneyInput id={name} name={name} defaultValue={v(name)} invalid={bad(name)} currency={currency} />
      ) : opts.kind === "grouped" ? (
        <GroupedNumberInput id={name} name={name} defaultValue={v(name)} invalid={bad(name)} />
      ) : opts.smart ? (
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
      <SmartTextarea id={name} name={name} defaultValue={v(name)} />
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

      <Card accent="blue" className="space-y-4">
        <SectionTitle accent="blue">{t("form.contact")}</SectionTitle>
        <p className="-mt-2 text-xs text-muted">{t("form.identityHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {input("first_name", t("form.firstName"), { autoComplete: "off", smart: "name" })}
          {input("last_name", t("form.lastName"), { autoComplete: "off", smart: "name" })}
          <div className="sm:col-span-2">{input("company_name", t("form.companyName"))}</div>
          {input("email", t("form.email"), { type: "email" })}
          <Field label={t("form.phone")} htmlFor="phone">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1"><PhoneInput id="phone" name="phone" defaultValue={v("phone")} invalid={bad("phone")} /></div>
              {labelSelect("phone_label")}
              {!showSecond && (
                <button type="button" onClick={() => setShowSecond(true)} aria-label={t("form.addPhone")} title={t("form.addPhone")}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-primary hover:bg-surface-2"><Plus className="h-4 w-4" aria-hidden /></button>
              )}
            </div>
          </Field>
          {showSecond ? (
            <Field label={t("form.secondaryPhone")} htmlFor="secondary_phone">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1"><PhoneInput id="secondary_phone" name="secondary_phone" defaultValue={v("secondary_phone")} invalid={bad("secondary_phone")} /></div>
                {labelSelect("secondary_phone_label")}
                <button type="button" onClick={() => { setShowSecond(false); const el = document.getElementById("secondary_phone") as HTMLInputElement | null; if (el) el.value = ""; }}
                  aria-label={t("form.removePhone")} title={t("form.removePhone")}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-muted hover:text-danger"><X className="h-4 w-4" aria-hidden /></button>
              </div>
            </Field>
          ) : (
            input("customer_since", t("form.customerSince"), { type: "date" })
          )}
          {showSecond && input("customer_since", t("form.customerSince"), { type: "date" })}
          {input("referred_by", t("form.referredBy"), { smart: "sentence" })}
        </div>
      </Card>

      <Card accent="green" className="space-y-4">
        <SectionTitle accent="green">{t("form.property")}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-6">
            <Field label={t("form.serviceAddress")} htmlFor="service_address">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1"><SmartTextInput id="service_address" name="service_address" mode="address" defaultValue={v("service_address")} invalid={bad("service_address")} /></div>
                <button type="button" onClick={openMap} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-muted hover:text-fg">
                  <ExternalLink className="h-4 w-4" aria-hidden />{t("form.openMap")}
                </button>
              </div>
            </Field>
          </div>
          <div className="sm:col-span-2">{input("city", t("form.city"), { smart: "address" })}</div>
          <div className="sm:col-span-2">{input("state", t("form.state"), { smart: "state" })}</div>
          <div className="sm:col-span-2">{input("zip_code", t("form.zipCode"), { kind: "zip" })}</div>
          <div className="sm:col-span-3">
            <Field label={t("form.propertyType")} htmlFor="property_type">
              <Select id="property_type" name="property_type" defaultValue={v("property_type")}>
                <option value="">{t("form.choose")}</option>
                {PROPERTY_TYPES.map((p) => <option key={p} value={p}>{t(`propertyType.${p}`)}</option>)}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-3">
            <Field label={t("form.frequency")} htmlFor="cleaning_frequency">
              <Select id="cleaning_frequency" name="cleaning_frequency" defaultValue={v("cleaning_frequency")}>
                <option value="">{t("form.choose")}</option>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{t(`frequency.${f}`)}</option>)}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2">{input("bedrooms", t("form.bedrooms"), { inputMode: "numeric" })}</div>
          <div className="sm:col-span-2">{input("bathrooms", t("form.bathrooms"), { inputMode: "decimal", hint: "1, 1.5, 2…" })}</div>
          <div className="sm:col-span-2">{input("square_footage", t("form.squareFootage"), { kind: "grouped" })}</div>
          <div className="sm:col-span-6">{area("access_instructions", t("form.accessInstructions"))}</div>
          <div className="sm:col-span-6">{input("billing_address", t("form.billingAddress"), { smart: "address" })}</div>
        </div>
      </Card>

      <Card accent="violet" className="space-y-4">
        <SectionTitle accent="violet">{t("form.service")}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          {input("preferred_service", t("form.preferredService"), { smart: "sentence" })}
          {input("estimated_price", t("form.estimatedPrice"), { kind: "money" })}
          {input("pets", t("form.pets"), { smart: "sentence" })}
          <Field label={t("form.rating")} htmlFor="rating" hint={t("form.ratingHint")}>
            <Select id="rating" name="rating" defaultValue={v("rating")}>
              <option value="">{t("form.choose")}</option>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}{"☆".repeat(5 - n)}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2">{area("special_instructions", t("form.specialInstructions"))}</div>
        </div>
      </Card>

      <Card accent="amber" className="space-y-4">
        <SectionTitle accent="amber">{t("form.notesSection")}</SectionTitle>
        {area("notes", t("form.notes"))}
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? tc("loading") : submitLabel}</Button>
        <Link href={cancelHref} className="text-sm text-muted hover:text-fg">{tc("cancel")}</Link>
      </div>
    </form>
  );
}
