"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { saveBusinessSettings } from "@/app/(app)/settings/actions";

type Values = {
  name: string; phone: string; email: string; address: string; tax_id: string;
  currency: string; timezone: string; date_format: string; doc_locale: string;
};

const CURRENCIES = ["USD", "MXN", "CAD", "EUR", "GBP"];
const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Mexico_City", "America/Toronto",
];

export function BusinessSettingsForm({ values, canEdit }: { values: Values; canEdit: boolean }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState(saveBusinessSettings, undefined);
  const zones = TIMEZONES.includes(values.timezone) ? TIMEZONES : [values.timezone, ...TIMEZONES];
  const currencies = CURRENCIES.includes(values.currency) ? CURRENCIES : [values.currency, ...CURRENCIES];

  return (
    <form action={action} className="space-y-6">
      {!canEdit && <p className="text-sm text-muted">{t("business.readOnly")}</p>}
      {state?.error && <Alert>{tc(state.error)}</Alert>}
      {state?.saved && <Alert tone="success">{tc("saved")}</Alert>}

      <fieldset disabled={!canEdit} className="space-y-4">
        <h2 className="text-base font-semibold">{t("business.title")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("business.name")} htmlFor="name"><Input id="name" name="name" defaultValue={values.name} required /></Field>
          <Field label={t("business.phone")} htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={values.phone} /></Field>
          <Field label={t("business.email")} htmlFor="email"><Input id="email" name="email" type="email" defaultValue={values.email} /></Field>
          <Field label={t("business.taxId")} htmlFor="tax_id"><Input id="tax_id" name="tax_id" defaultValue={values.tax_id} /></Field>
          <div className="sm:col-span-2">
            <Field label={t("business.address")} htmlFor="address"><Input id="address" name="address" defaultValue={values.address} /></Field>
          </div>
        </div>

        <h2 className="pt-2 text-base font-semibold">{t("regional.title")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("regional.currency")} htmlFor="currency">
            <Select id="currency" name="currency" defaultValue={values.currency}>
              {currencies.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t("regional.timezone")} htmlFor="timezone">
            <Select id="timezone" name="timezone" defaultValue={values.timezone}>
              {zones.map((z) => <option key={z}>{z}</option>)}
            </Select>
          </Field>
          <Field label={t("regional.dateFormat")} htmlFor="date_format">
            <Select id="date_format" name="date_format" defaultValue={values.date_format}>
              {["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"].map((f) => <option key={f}>{f}</option>)}
            </Select>
          </Field>
          <Field label={t("regional.docLocale")} hint={t("regional.docLocaleHelp")} htmlFor="doc_locale">
            <Select id="doc_locale" name="doc_locale" defaultValue={values.doc_locale}>
              <option value="en">{tc("english")}</option>
              <option value="es">{tc("spanish")}</option>
            </Select>
          </Field>
        </div>
      </fieldset>

      {canEdit && <Button type="submit" disabled={pending}>{pending ? tc("loading") : tc("save")}</Button>}
    </form>
  );
}
