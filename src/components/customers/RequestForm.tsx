"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Field, Input, Select, Card, SectionTitle } from "@/components/ui";
import { GroupedNumberInput, SmartTextarea, ZipInput } from "@/components/ui/fields";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { EmailInput } from "@/components/ui/EmailInput";
import { SmartTextInput } from "@/components/ui/SmartTextInput";
import { Turnstile } from "@/components/Turnstile";
import type { TextMode } from "@/lib/text";
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

  const f = (name: string, label: string, type = "text", extra: { autoComplete?: string; inputMode?: "numeric" | "decimal"; smart?: TextMode; kind?: "zip" | "grouped" } = {}) => (
    <Field label={label} htmlFor={name}>
      {extra.kind === "zip" ? <ZipInput id={name} name={name} /> : extra.kind === "grouped" ? <GroupedNumberInput id={name} name={name} /> : extra.smart ? <SmartTextInput id={name} name={name} mode={extra.smart} autoComplete={extra.autoComplete} /> : type === "tel" ? <PhoneInput id={name} name={name} /> : type === "email" ? <EmailInput id={name} name={name} /> : <Input id={name} name={name} type={type} {...extra} />}
    </Field>
  );

  return (
    <form action={submit} className="space-y-5">
      {state?.error && <Alert>{state.error === "contactNeeded" ? t("contactNeeded") : t(state.error)}</Alert>}
      {/* honeypot: hidden from people and assistive tech */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <Card accent="blue" className="space-y-4">
        <SectionTitle accent="blue">{t("contact")}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          {f("first_name", tf("form.firstName"), "text", { autoComplete: "given-name", smart: "name" })}
          {f("last_name", tf("form.lastName"), "text", { autoComplete: "family-name", smart: "name" })}
          <div className="sm:col-span-2">{f("company_name", tf("form.companyName"), "text", { autoComplete: "organization" })}</div>
          {f("email", tf("form.email"), "email", { autoComplete: "email" })}
          {f("phone", tf("form.phone"), "tel", { autoComplete: "tel" })}
        </div>
      </Card>

      <Card accent="green" className="space-y-4">
        <SectionTitle accent="green">{t("property")}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{f("service_address", tf("form.serviceAddress"), "text", { autoComplete: "street-address", smart: "address" })}</div>
          {f("city", tf("form.city"), "text", { smart: "address" })}
          {f("state", tf("form.state"), "text", { smart: "state" })}
          {f("zip_code", tf("form.zipCode"), "text", { kind: "zip" })}
          <Field label={tf("form.propertyType")} htmlFor="property_type">
            <Select id="property_type" name="property_type" defaultValue="">
              <option value="">{tf("form.choose")}</option>
              {PROPERTY_TYPES.map((p) => <option key={p} value={p}>{tf(`propertyType.${p}`)}</option>)}
            </Select>
          </Field>
          {f("square_footage", tf("form.squareFootage"), "text", { kind: "grouped" })}
          {f("bedrooms", tf("form.bedrooms"), "text", { inputMode: "numeric" })}
          {f("bathrooms", tf("form.bathrooms"), "text", { inputMode: "decimal" })}
          <Field label={tf("form.frequency")} htmlFor="cleaning_frequency">
            <Select id="cleaning_frequency" name="cleaning_frequency" defaultValue="">
              <option value="">{tf("form.choose")}</option>
              {FREQUENCIES.map((x) => <option key={x} value={x}>{tf(`frequency.${x}`)}</option>)}
            </Select>
          </Field>
          {f("preferred_service", tf("form.preferredService"), "text", { smart: "sentence" })}
        </div>
      </Card>

      <Card accent="amber" className="space-y-2">
        <label htmlFor="message" className="block text-base font-semibold">{t("message")}</label>
        <SmartTextarea id="message" name="message" rows={4} maxLength={2000} />
      </Card>

      <Turnstile />
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">{pending ? tc("loading") : t("submit")}</Button>
    </form>
  );
}
