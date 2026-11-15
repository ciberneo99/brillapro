"use client";

import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui";
import { DatePicker } from "@/components/ui/DatePicker";
import { MoneyInput } from "@/components/ui/fields";
import { usePaymentMethods } from "@/components/PaymentMethodsProvider";
import { methodChoices } from "@/modules/payment-methods/labels";

export type PaymentValues = { amount: string; paid_on: string; method: string; reference: string; notes: string };

/** The five payment inputs, shared by "Add payment" and "Edit payment". `idp` keeps element ids unique per form. */
export function PaymentFields({ idp, v, currency, dateFormat }: { idp: string; v: PaymentValues; currency: string; dateFormat: string }) {
  const t = useTranslations("invoices");
  const methods = usePaymentMethods();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("amount")} htmlFor={`${idp}-amount`}><MoneyInput id={`${idp}-amount`} name="amount" defaultValue={v.amount} currency={currency} required /></Field>
      <Field label={t("paidOn")} htmlFor={`${idp}-paid_on`}><DatePicker id={`${idp}-paid_on`} name="paid_on" defaultValue={v.paid_on} dateFormat={dateFormat} /></Field>
      <Field label={t("methodLabel")} htmlFor={`${idp}-method`}>
        <Select id={`${idp}-method`} name="method" defaultValue={v.method}>{methodChoices(methods, v.method).map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select>
      </Field>
      <Field label={t("reference")} htmlFor={`${idp}-reference`}><Input id={`${idp}-reference`} name="reference" maxLength={120} defaultValue={v.reference} /></Field>
      <div className="sm:col-span-2"><Input name="notes" maxLength={500} defaultValue={v.notes} placeholder={t("paymentNotes")} aria-label={t("paymentNotes")} /></div>
    </div>
  );
}
