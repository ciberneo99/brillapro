"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/components/ui";

export type MenuOption = { value: string; label: string; disabled?: boolean };

/**
 * A drop-down list in the app's own style: rounded panel that fades in, soft teal highlight, check on the chosen item.
 * Submits its value under `name` inside a form, or works controlled through `value` / `onChange`.
 */
export function SelectMenu({
  options, name, value, defaultValue = "", onChange, ariaLabel, className, placeholder = "", id, disabled,
}: {
  options: MenuOption[]; name?: string; value?: string; defaultValue?: string; onChange?: (value: string) => void;
  ariaLabel: string; className?: string; placeholder?: string; id?: string; disabled?: boolean;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === current);

  function place() {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    if (r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return; }
    const need = Math.min(options.length * 38 + 12, 280);
    const up = window.innerHeight - r.bottom < need + 12 && r.top > window.innerHeight - r.bottom;
    const width = Math.max(r.width, 176);
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width, up });
  }
  function show() {
    place();
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  }
  function pick(v: string) {
    if (value === undefined) setInner(v);
    onChange?.(v);
    setOpen(false);
    trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const away = (e: Event) => { if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false); };
    const follow = (e: Event) => { if (!panel.current?.contains(e.target as Node)) place(); };
    document.addEventListener("mousedown", away);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", place);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("scroll", follow, true); window.removeEventListener("resize", place); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { panel.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  function keys(e: React.KeyboardEvent) {
    const last = options.length - 1;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, last)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(last); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const o = options[active]; if (o && !o.disabled) pick(o.value); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) {
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        ref={trigger} id={id} type="button" role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined} disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); show(); } }}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-left text-sm text-fg transition-colors hover:border-primary/50 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60",
          open && "border-primary ring-2 ring-primary/30",
          className,
        )}
      >
        <span className={cn("truncate", !selected && "text-muted")}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform duration-150", open && "rotate-180 text-primary")} aria-hidden />
      </button>
      {open && pos && (
        <ul
          ref={panel} id={listId} role="listbox" aria-label={ariaLabel} tabIndex={-1} onKeyDown={keys}
          style={{ position: "fixed", left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          className={cn("bp-pop z-[60] max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-lg outline-none", pos.up && "bp-pop-up")}
        >
          {options.map((o, i) => (
            <li
              key={o.value || `empty-${i}`} role="option" aria-selected={o.value === current} aria-disabled={o.disabled} data-idx={i}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (!o.disabled) pick(o.value); }}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                i === active && "bg-primary-soft text-primary",
                o.value === current && "font-medium",
                o.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === current && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
