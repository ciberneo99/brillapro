"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";

export type CustomerOption = { id: string; name: string; email: string | null; phone: string | null; address: string | null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Search box for customers: matches name, email, phone and address; arrow keys + Enter to pick. */
export function CustomerSearch({
  customers, selectedId, onSelect, id, autoFocus,
}: { customers: CustomerOption[]; selectedId: string | null; onSelect: (c: CustomerOption | null) => void; id: string; autoFocus?: boolean }) {
  const t = useTranslations("invoices.search");
  const listId = useId();
  const selected = customers.find((c) => c.id === selectedId) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = norm(query.trim());
    const digits = q.replace(/\D/g, "");
    const list = q
      ? customers.filter((c) => norm(`${c.name} ${c.email ?? ""} ${c.address ?? ""}`).includes(q) || (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits)))
      : customers;
    return list.slice(0, 8);
  }, [customers, query]);

  const pick = (c: CustomerOption) => {
    onSelect(c);
    setQuery("");
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && results[active]) { e.preventDefault(); pick(results[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={root} className="relative" onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id={id} type="text" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" autoFocus={autoFocus}
          value={query} placeholder={selected ? selected.name : t("placeholder")}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
          className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-9 text-sm placeholder:text-fg"
        />
        {selected && (
          <button type="button" onClick={() => { onSelect(null); setQuery(""); }} aria-label={t("clear")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-surface shadow-lg">
          {results.length === 0 && <li className="px-3 py-3 text-sm text-muted">{t("none")}</li>}
          {results.map((c, i) => (
            <li key={c.id} role="option" aria-selected={c.id === selectedId}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)} onMouseEnter={() => setActive(i)}
                className={cn("block w-full px-3 py-2 text-left text-sm", i === active ? "bg-primary-soft" : "hover:bg-surface-2")}>
                <span className="block font-medium">{c.name}</span>
                <span className="block truncate text-xs text-muted">{[c.email, c.phone, c.address].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
