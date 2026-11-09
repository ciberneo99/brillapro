"use client";

import { useState } from "react";
import { Input } from "@/components/ui";
import { finalFormat, liveFormat, type TextMode } from "@/lib/text";

/** Text field that raises the first letter of each word as you type (names, addresses, city, state). */
export function SmartTextInput({
  id, name, mode, defaultValue = "", autoComplete, invalid, required, maxLength,
}: {
  id: string; name: string; mode: TextMode; defaultValue?: string; autoComplete?: string;
  invalid?: boolean; required?: boolean; maxLength?: number;
}) {
  const [value, setValue] = useState(() => finalFormat(mode, defaultValue));
  return (
    <Input
      id={id} name={name} type="text" autoComplete={autoComplete} required={required} maxLength={maxLength}
      value={value}
      onChange={(e) => setValue(liveFormat(mode, e.target.value))}
      onBlur={() => setValue((v) => finalFormat(mode, v))}
      aria-invalid={invalid || undefined} className={invalid ? "border-danger" : undefined}
    />
  );
}
