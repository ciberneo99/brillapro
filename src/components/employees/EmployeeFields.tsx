"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui";
import { EmailInput } from "@/components/ui/EmailInput";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { SmartTextInput } from "@/components/ui/SmartTextInput";
import { ZipInput } from "@/components/ui/fields";

export type EmployeeValues = {
  full_name?: string; phone?: string | null; phone_2?: string | null; email?: string | null;
  address?: string | null; city?: string | null; state?: string | null; zip_code?: string | null;
};

/**
 * The personal fields shared by the "Add employee" card and the edit form of each employee card:
 * name, phone (with a + for one optional additional phone), email, and the address as street / city / state / ZIP.
 */
export function EmployeeFields({ prefix, values = {} }: { prefix: string; values?: EmployeeValues }) {
  const t = useTranslations("employees");
  const [second, setSecond] = useState(Boolean(values.phone_2));
  const id = (k: string) => `${k}-${prefix}`;

  return (
    <>
      <Field label={t("name")} htmlFor={id("n")}><SmartTextInput id={id("n")} name="full_name" mode="name" defaultValue={values.full_name ?? ""} required maxLength={120} /></Field>

      <Field label={t("phone")} htmlFor={id("p")}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><PhoneInput id={id("p")} name="phone" defaultValue={values.phone ?? ""} /></div>
          {!second && (
            <button
              type="button" onClick={() => setSecond(true)} title={t("addPhone")} aria-label={t("addPhone")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-muted hover:border-primary hover:bg-primary-soft hover:text-primary"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </Field>
      {second && (
        <Field label={t("phone2")} htmlFor={id("p2")}>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><PhoneInput id={id("p2")} name="phone_2" defaultValue={values.phone_2 ?? ""} /></div>
            <button
              type="button" onClick={() => setSecond(false)} title={t("removePhone")} aria-label={t("removePhone")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-muted hover:border-danger hover:bg-danger-soft hover:text-danger"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </Field>
      )}

      <Field label={t("email")} htmlFor={id("e")}><EmailInput id={id("e")} name="email" defaultValue={values.email ?? ""} /></Field>

      <Field label={t("address")} htmlFor={id("a")}><SmartTextInput id={id("a")} name="address" mode="address" defaultValue={values.address ?? ""} maxLength={300} autoComplete="street-address" /></Field>
      <Field label={t("city")} htmlFor={id("c")}><SmartTextInput id={id("c")} name="city" mode="address" defaultValue={values.city ?? ""} maxLength={100} autoComplete="address-level2" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("state")} htmlFor={id("s")}><SmartTextInput id={id("s")} name="state" mode="state" defaultValue={values.state ?? ""} maxLength={60} autoComplete="address-level1" /></Field>
        <Field label={t("zipCode")} htmlFor={id("z")}><ZipInput id={id("z")} name="zip_code" defaultValue={values.zip_code ?? ""} /></Field>
      </div>
    </>
  );
}
