"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

/**
 * Search box that filters as you type (no Enter needed): after a short pause it puts the text in the address
 * (?q=...), which re-renders the list on the server. Other filters in the address are kept; the page number is reset.
 */
export function LiveSearch({ placeholder, label, defaultValue }: { placeholder: string; label: string; defaultValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const go = (text: string) => {
    const next = new URLSearchParams(params.toString());
    const q = text.trim();
    if (q) next.set("q", q); else next.delete("q");
    next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div role="search" className="relative min-w-56 flex-1">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        name="q" type="search" value={value} placeholder={placeholder} aria-label={label} maxLength={80} autoComplete="off"
        onChange={(e) => {
          setValue(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => go(e.target.value), 250);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (timer.current) clearTimeout(timer.current); go(value); } }}
        className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm placeholder:text-muted"
      />
    </div>
  );
}
