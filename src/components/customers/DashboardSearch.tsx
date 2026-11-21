"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { quickSearchCustomers, type QuickHit } from "@/modules/customers/quick-search";

/**
 * Dashboard search: results appear under the box while you type (no Enter needed). Enter opens the full list for that text.
 * Arrow keys move through the results; Esc closes them.
 */
export function DashboardSearch({ placeholder, label, allLabel, emptyLabel }: { placeholder: string; label: string; allLabel: string; emptyLabel: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [hits, setHits] = useState<QuickHit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  function onChange(value: string) {
    setText(value);
    setActive(-1);
    const mine = ++seq.current;
    if (value.trim().length < 2) { setHits(null); setOpen(false); return; }
    setOpen(true);
    setTimeout(async () => {
      if (mine !== seq.current) return; // a newer keystroke replaced this one
      try {
        const r = await quickSearchCustomers(value);
        if (mine === seq.current) setHits(r);
      } catch { if (mine === seq.current) setHits([]); }
    }, 200);
  }

  function onKey(e: React.KeyboardEvent) {
    const n = hits?.length ?? 0;
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => (n ? (a + 1) % n : -1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (n ? (a <= 0 ? n - 1 : a - 1) : -1)); }
    else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && hits?.[active]) router.push(`/customers/${hits[active].id}`);
      else if (text.trim()) router.push(`/customers?q=${encodeURIComponent(text.trim())}`);
    }
  }

  return (
    <div ref={root} role="search" className="relative flex-1">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search" value={text} placeholder={placeholder} aria-label={label} maxLength={80} autoComplete="off"
        role="combobox" aria-expanded={open} aria-controls="dash-search-results" aria-autocomplete="list"
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} onFocus={() => { if (hits) setOpen(true); }}
        className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm placeholder:text-muted"
      />
      {open && hits && (
        <ul id="dash-search-results" role="listbox" className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{emptyLabel}</li>
          ) : (
            <>
              {hits.map((h, i) => (
                <li key={h.id} role="option" aria-selected={i === active}>
                  <Link
                    href={`/customers/${h.id}`} onClick={() => setOpen(false)}
                    className={`flex flex-col rounded-lg px-3 py-2 text-sm hover:bg-primary-soft hover:text-primary ${i === active ? "bg-primary-soft text-primary" : ""}`}
                  >
                    <span className="font-medium">{h.name}</span>
                    {h.detail && <span className="text-xs text-muted">{h.detail}</span>}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={`/customers?q=${encodeURIComponent(text.trim())}`} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft">
                  {allLabel}
                </Link>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}
