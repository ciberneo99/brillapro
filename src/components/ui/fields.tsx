"use client";

import { useState } from "react";
import { Input, cn } from "@/components/ui";
import { formatMoneyFinal, formatMoneyTyping, groupInteger } from "@/lib/numbers";
import { formatZipTyping } from "@/lib/zip";
import { finalFormat, liveFormat } from "@/lib/text";

type Base = { id: string; name: string; defaultValue?: string; invalid?: boolean; required?: boolean };
const bad = (invalid?: boolean) => (invalid ? "border-danger" : undefined);

/** ZIP code: digits only, auto hyphen (12345-6789). */
export function ZipInput({ id, name, defaultValue = "", invalid, required }: Base) {
  const [value, setValue] = useState(() => formatZipTyping(defaultValue));
  return (
    <Input
      id={id} name={name} inputMode="numeric" autoComplete="postal-code" maxLength={10} placeholder="12345" required={required}
      value={value} onChange={(e) => setValue(formatZipTyping(e.target.value))}
      aria-invalid={invalid || undefined} className={bad(invalid)}
    />
  );
}

/** Money: currency symbol, thousands separators, always two decimals when you leave the field. */
export function MoneyInput({ id, name, defaultValue = "", invalid, required, currency = "USD" }: Base & { currency?: string }) {
  const [value, setValue] = useState(() => formatMoneyFinal(defaultValue));
  const symbol = new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? "$";
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{symbol}</span>
      <Input
        id={id} name={name} inputMode="decimal" placeholder="0.00" required={required} maxLength={12} value={value}
        onChange={(e) => setValue(formatMoneyTyping(e.target.value))}
        onBlur={() => setValue((v) => formatMoneyFinal(v))}
        aria-invalid={invalid || undefined} className={cn("pl-7", bad(invalid))}
      />
    </div>
  );
}

/** Whole number with thousands separators (e.g. square footage: 1,800). */
export function GroupedNumberInput({ id, name, defaultValue = "", invalid, required, max = 7 }: Base & { max?: number }) {
  const [value, setValue] = useState(() => groupInteger(defaultValue, max));
  return (
    <Input
      id={id} name={name} inputMode="numeric" required={required} value={value}
      onChange={(e) => setValue(groupInteger(e.target.value, max))}
      aria-invalid={invalid || undefined} className={bad(invalid)}
    />
  );
}

/** Multi-line text that raises the first letter of each sentence. */
export function SmartTextarea({ id, name, defaultValue = "", rows = 3, maxLength }: Base & { rows?: number; maxLength?: number }) {
  const [value, setValue] = useState(() => finalFormat("sentence", defaultValue));
  return (
    <textarea
      id={id} name={name} rows={rows} maxLength={maxLength} value={value}
      onChange={(e) => setValue(liveFormat("sentence", e.target.value))}
      onBlur={() => setValue((v) => finalFormat("sentence", v))}
      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg"
    />
  );
}
