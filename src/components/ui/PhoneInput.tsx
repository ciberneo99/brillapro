"use client";

import { useState } from "react";
import { Input } from "@/components/ui";
import { formatPhone, normalizePhone } from "@/lib/phone";

/** Phone field that formats as xxx-xxx-xxxx while typing. Submits the formatted value. */
export function PhoneInput({
  id, name, defaultValue = "", autoComplete = "tel", invalid, required,
}: { id: string; name: string; defaultValue?: string; autoComplete?: string; invalid?: boolean; required?: boolean }) {
  const [value, setValue] = useState(() => normalizePhone(defaultValue));
  return (
    <Input
      id={id} name={name} type="tel" inputMode="tel" autoComplete={autoComplete} required={required}
      placeholder="555-123-4567" maxLength={40} value={value}
      onChange={(e) => setValue(formatPhone(e.target.value))}
      aria-invalid={invalid || undefined} className={invalid ? "border-danger" : undefined}
    />
  );
}
