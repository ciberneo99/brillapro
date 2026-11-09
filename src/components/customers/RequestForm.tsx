"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Field, Input, Select, Card } from "@/components/ui";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { FREQUENCIES, PROPERTY_TYPES } from "@/modules/customers/schema";
import type { RequestState } from "@/app/request/[slug]/actions";

export function RequestForm({
  action, company,
}: {
  action: (state: RequestState, formData: FormData) => Promise<RequestState>;
  company: string;
}) {
  const t = useTranslations("request");
  const tf = useTranslations("customers");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(action, undefined);
  // Time the form appeared in the browser (anti-bot: instant submits are rejected). Kept out of the
  // server-rendered HTML so server and client markup match.
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);
  const submit = (fd: FormData) => {
    fd.set("rendered_at", String(mountedAt.current));
    formAction(fd);
  };

  if (state?.done) {
    return (
      <Card className="text-center">
        <p className="text-lg font-semibold">{t("successTitle")}</p>
        <p className="mt-1 text-sm text-muted">{t("successBody", { company })}</p>
      </Card>
    );
  }

  const f = (name: string, label: string, type = "text", extra: { autoComplete?: string; inputMode?: "numeric" | "decimal" } = {}) => (
    <Field label={label} htmlFor={name}>
      {type === "tel" ? <PhoneInput id={name} name={name} /> : <Input id={name} name={name} type={type} {...extra} />}
    </Field>
  );

  return (
    <form action={submit} className="space-y-5">
      {state?.error && <Alert>{state.error === "contactNeeded" ? t("contactNeeded") : t(state.error)}</Alert>}
      {/* honeypot: hidden from people and assistive tech */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">{t("contact")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {f("first_name", tf("form.firstName"), "text", { autoComplete: "given-name" })}
          {f("last_name", tf("form.lastName"), "text", { autoComplete: "family-name" })}
          <div className="sm:col-span-2">{f("company_name", tf("form.companyName"), "text", { autoComplete: "organization" })}</div>
          {f("email", tf("form.email"), "email", { autoComplete: "email" })}
          {f("phone", tf("form.phone"), "tel", { autoComplete: "tel" })}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">{t("property")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{f("service_address", tf("form.serviceAddress"), "text", { autoComplete: "street-address" })}</div>
          {f("city", tf("form.city"))}
          {f("state", tf("form.state"))}
          {f("zip_code", tf("form.zipCode"), "text", { inputMode: "numeric", autoComplete: "postal-code" })}
          <Field label={tf("form.propertyType")} htmlFor="property_type">
            <Select id="property_type" name="property_type" defaultValue="">
              <option value="">{tf("form.choose")}</option>
              {PROPERTY_TYPES.map((p) => <option key={p} value={p}>{tf(`propertyType.${p}`)}</option>)}
            </Select>
          </Field>
          {f("square_footage", tf("form.squareFootage"), "text", { inputMode: "numeric" })}
          {f("bedrooms", tf("form.bedrooms"), "text", { inputMode: "numeric" })}
          {f("bathrooms", tf("form.bathrooms"), "text", { inputMode: "decimal" })}
          <Field label={tf("form.frequency")} htmlFor="cleaning_frequency">
            <Select id="cleaning_frequency" name="cleaning_frequency" defaultValue="">
              <option value="">{tf("form.choose")}</option>
              {FREQUENCIES.map((x) => <option key={x} value={x}>{tf(`frequency.${x}`)}</option>)}
            </Select>
          </Field>
          {f("preferred_service", tf("form.preferredService"))}
        </div>
      </Card>

      <Card className="space-y-2">
        <label htmlFor="message" className="block text-base font-semibold">{t("message")}</label>
        <textarea id="message" name="message" rows={4} maxLength={2000} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg" />
      </Card>

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">{pending ? tc("loading") : t("submit")}</Button>
    </form>
  );
}
