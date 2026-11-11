"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";

export type CategoryChoice = { id: string; name: string; parent: string | null };
type Extra = { value: string; label: string };
type Item = { value: string; label: string; indent: boolean; header?: boolean };

/**
 * A category picker with search: type to narrow the list, arrow keys and Enter to choose.
 * Works inside a form (it submits the chosen id under `name`) or controlled through `value` / `onChange`.
 * Categories that have subcategories are only choosable when `allowParents` is set (filters).
 */
export function CategoryPicker({
  choices, name, value, defaultValue = "", onChange, extras = [], placeholder, ariaLabel, className, allowParents = false,
}: {
  choices: CategoryChoice[]; name?: string; value?: string; defaultValue?: string; onChange?: (id: string) => void;
  extras?: Extra[]; placeholder: string; ariaLabel: string; className?: string; allowParents?: boolean;
}) {
  const t = useTranslations("bank.picker");
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const out: Item[] = [];
    for (const e of extras) if (!needle || e.label.toLowerCase().includes(needle)) out.push({ value: e.value, label: e.label, indent: false });
    for (const p of choices.filter((c) => !c.parent)) {
      const kids = choices.filter((c) => c.parent === p.name);
      const parentHit = !needle || p.name.toLowerCase().includes(needle);
      const shown = parentHit ? kids : kids.filter((k) => k.name.toLowerCase().includes(needle));
      if (!parentHit && shown.length === 0) continue;
      if (kids.length === 0 || allowParents) out.push({ value: p.id, label: p.name, indent: false });
      else out.push({ value: "", label: p.name, indent: false, header: true });
      for (const k of shown) out.push({ value: k.id, label: k.name, indent: true });
    }
    return out;
  }, [choices, extras, q, allowParents]);
  const pickable = items.filter((i) => !i.header);

  const selected = [...extras, ...choices.map((c) => ({ value: c.id, label: c.name }))].find((o) => o.value === current);

  function place() {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    if (r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return; }
    const width = Math.max(r.width, 272);
    const below = window.innerHeight - r.bottom;
    setPos({ top: below > 300 ? r.bottom + 4 : Math.max(8, r.top - 324), left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width });
  }
  function show() { place(); setQ(""); setActive(0); setOpen(true); }
  const close = () => { setOpen(false); trigger.current?.focus(); };
  function pick(v: string) {
    if (value === undefined) setInner(v);
    onChange?.(v);
    setOpen(false);
    trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const away = (e: Event) => { if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false); };
    const follow = (e: Event) => { if (!panel.current?.contains(e.target as Node)) place(); };
    document.addEventListener("mousedown", away);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", place);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("scroll", follow, true); window.removeEventListener("resize", place); };
  }, [open]);

  useEffect(() => { panel.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  function keys(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, pickable.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const it = pickable[active]; if (it) pick(it.value); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") setOpen(false);
  }

  let idx = -1;
  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        ref={trigger} type="button" role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); show(); } }}
        className={cn("flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-left text-sm text-fg hover:bg-surface-2", className)}
      >
        <span className={cn("truncate", !selected && "text-muted")}>{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </button>
      {open && pos && (
        <div ref={panel} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }} className="z-50 rounded-xl border border-line bg-surface shadow-lg">
          <div className="relative border-b border-line p-2">
            <Search className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-muted" aria-hidden />
            <input
              ref={search} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={keys}
              placeholder={t("search")} aria-label={t("search")} autoComplete="off"
              className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-muted"
            />
          </div>
          <ul id={listId} role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-y-auto p-1">
            {items.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">{t("empty")}</li>}
            {items.map((it, i) => {
              if (it.header) return <li key={`h${i}`} role="presentation" className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">{it.label}</li>;
              idx += 1;
              const n = idx;
              return (
                <li
                  key={`${it.value}:${i}`} role="option" aria-selected={it.value === current} data-idx={n}
                  onMouseEnter={() => setActive(n)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(it.value)}
                  className={cn("flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm", it.indent && "pl-6", n === active && "bg-surface-2", !it.indent && it.value && "font-medium")}
                >
                  <span>{it.label}</span>
                  {it.value === current && <Check className="h-4 w-4 text-primary" aria-hidden />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
