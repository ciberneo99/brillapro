"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui";
import { EMAIL_PATTERN, sanitizeEmail } from "@/lib/email";

/** Email field that only lets a valid address shape through (lowercase, no spaces, one @). */
export function EmailInput({
  id, name, defaultValue = "", autoComplete = "email", invalid, required,
}: { id: string; name: string; defaultValue?: string; autoComplete?: string; invalid?: boolean; required?: boolean }) {
  const t = useTranslations("auth");
  const [value, setValue] = useState(() => sanitizeEmail(defaultValue));
  return (
    <Input
      id={id} name={name} type="email" inputMode="email" autoComplete={autoComplete} required={required}
      autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="name@example.com" maxLength={254}
      pattern={EMAIL_PATTERN} title={t("invalidEmail")} value={value}
      onChange={(e) => {
        e.currentTarget.setCustomValidity("");
        setValue(sanitizeEmail(e.target.value));
      }}
      onInvalid={(e) => e.currentTarget.setCustomValidity(t("invalidEmail"))}
      aria-invalid={invalid || undefined} className={invalid ? "border-danger" : undefined}
    />
  );
}
