"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Field, Input, Card, SectionTitle, cn } from "@/components/ui";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { GroupedNumberInput, SmartTextarea, ZipInput } from "@/components/ui/fields";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { EmailInput } from "@/components/ui/EmailInput";
import { SmartTextInput } from "@/components/ui/SmartTextInput";
import { Turnstile } from "@/components/Turnstile";
import type { TextMode } from "@/lib/text";
import { FREQUENCIES, PROPERTY_TYPES } from "@/modules/customers/schema";
import type { RequestState } from "@/app/request/[slug]/actions";

export function RequestForm({
  action, company, services,
}: {
  action: (state: RequestState, formData: FormData) => Promise<RequestState>;
  company: string;
  /** The company's active service types (Settings → Services), in the order it set. */
  services: string[];
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
  // The service list is a custom menu, so the browser cannot enforce "required" on it: check it here.
  const [serviceMissing, setServiceMissing] = useState(false);
  const submit = (fd: FormData) => {
    if (services.length > 0 && String(fd.get("preferred_service") ?? "") === "") {
      setServiceMissing(true);
      document.getElementById("preferred_service")?.focus();
      return;
    }
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

  const f = (name: string, label: string, type = "text", extra: { autoComplete?: string; inputMode?: "numeric" | "decimal"; smart?: TextMode; kind?: "zip" | "grouped"; required?: boolean } = {}) => (
    <Field label={extra.required ? `${label} *` : label} htmlFor={name}>
      {extra.kind === "zip" ? <ZipInput id={name} name={name} /> : extra.kind === "grouped" ? <GroupedNumberInput id={name} name={name} /> : extra.smart ? <SmartTextInput id={name} name={name} mode={extra.smart} autoComplete={extra.autoComplete} required={extra.required} /> : type === "tel" ? <PhoneInput id={name} name={name} required={extra.required} /> : type === "email" ? <EmailInput id={name} name={name} required={extra.required} /> : <Input id={name} name={name} type={type} {...extra} />}
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
          {f("first_name", tf("form.firstName"), "text", { autoComplete: "given-name", smart: "name", required: true })}
          {f("last_name", tf("form.lastName"), "text", { autoComplete: "family-name", smart: "name", required: true })}
          <div className="sm:col-span-2">{f("company_name", tf("form.companyName"), "text", { autoComplete: "organization" })}</div>
          {f("email", tf("form.email"), "email", { autoComplete: "email", required: true })}
          {f("phone", tf("form.phone"), "tel", { autoComplete: "tel", required: true })}
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
            <SelectMenu id="property_type" name="property_type" ariaLabel={tf("form.propertyType")} options={[{ value: "", label: tf("form.choose") }, ...PROPERTY_TYPES.map((p) => ({ value: p, label: tf(`propertyType.${p}`) }))]} />
          </Field>
          {f("square_footage", tf("form.squareFootage"), "text", { kind: "grouped" })}
          {f("bedrooms", tf("form.bedrooms"), "text", { inputMode: "numeric" })}
          {f("bathrooms", tf("form.bathrooms"), "text", { inputMode: "decimal" })}
          <Field label={tf("form.frequency")} htmlFor="cleaning_frequency">
            <SelectMenu id="cleaning_frequency" name="cleaning_frequency" ariaLabel={tf("form.frequency")} options={[{ value: "", label: tf("form.choose") }, ...FREQUENCIES.map((x) => ({ value: x, label: tf(`frequency.${x}`) }))]} />
          </Field>
          {services.length > 0 && (
            <Field label={`${tf("form.preferredService")} *`} htmlFor="preferred_service"> 
              <SelectMenu id="preferred_service" name="preferred_service" ariaLabel={tf("form.preferredService")} onChange={() => setServiceMissing(false)} className={cn(serviceMissing && "!border-danger")} options={[{ value: "", label: tf("form.choose") }, ...services.map((name) => ({ value: name, label: name }))]} />
              {serviceMissing && <p role="alert" className="text-sm text-danger">{t("chooseService")}</p>}
            </Field>
          )}
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
