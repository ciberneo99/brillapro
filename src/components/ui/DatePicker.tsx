"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker, type DropdownProps } from "react-day-picker";
import { enUS, es } from "react-day-picker/locale";
import { CalendarDays, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/components/ui";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { DEFAULT_DATE_FORMAT, formatLocalDate, isDateFormat, type DateFormat } from "@/lib/dates";

const toDate = (iso: string): Date | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined; // local date: no timezone shift
};
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const SEP: Record<DateFormat, string> = { "MM/DD/YYYY": "/", "DD/MM/YYYY": "/", "YYYY-MM-DD": "-" };
// Where the separators go in the digits typed so far (after 2 and 4 digits, or after 4 and 6 for year first).
const CUTS: Record<DateFormat, [number, number]> = { "MM/DD/YYYY": [2, 4], "DD/MM/YYYY": [2, 4], "YYYY-MM-DD": [4, 6] };

/** "1232026" → "12/32/026" style masking as the person types. */
function mask(digits: string, fmt: DateFormat): string {
  const [a, b] = CUTS[fmt];
  const s = SEP[fmt];
  const d = digits.slice(0, 8);
  return [d.slice(0, a), d.slice(a, b), d.slice(b)].filter((x, i) => x || i === 0).join(s);
}

/** A typed date in the company's pattern → a real local date, or undefined when incomplete or impossible (e.g. 02/31). */
function parseTyped(text: string, fmt: DateFormat): Date | undefined {
  const d = text.replace(/\D/g, "");
  if (d.length !== 8) return undefined;
  const [y, m, day] = fmt === "YYYY-MM-DD" ? [d.slice(0, 4), d.slice(4, 6), d.slice(6)] : fmt === "DD/MM/YYYY" ? [d.slice(4), d.slice(2, 4), d.slice(0, 2)] : [d.slice(4), d.slice(0, 2), d.slice(2, 4)];
  const date = new Date(Number(y), Number(m) - 1, Number(day));
  return date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(day) && Number(y) >= 1900 ? date : undefined;
}

/** Month / year lists inside the calendar use the same menu as every other drop-down. */
function MenuDropdown({ options, value, onChange, "aria-label": ariaLabel }: DropdownProps) {
  return (
    <SelectMenu
      ariaLabel={ariaLabel ?? ""} className="h-8 gap-1 border-transparent bg-transparent px-2 font-semibold hover:bg-primary-soft"
      value={String(value ?? "")} options={(options ?? []).map((o) => ({ value: String(o.value), label: o.label, disabled: o.disabled }))}
      onChange={(v) => onChange?.({ target: { value: v } } as unknown as React.ChangeEvent<HTMLSelectElement>)}
    />
  );
}

/**
 * Date field: type it (it adds the slashes: mm/dd/yyyy) or click it to open the calendar.
 * Submits an ISO date (yyyy-mm-dd) under `name`. The pattern shown follows the company setting.
 */
export function DatePicker({
  id, name, defaultValue = "", dateFormat, required, className,
}: { id: string; name: string; defaultValue?: string; dateFormat?: string; required?: boolean; className?: string }) {
  const fmt: DateFormat = isDateFormat(dateFormat) ? dateFormat : DEFAULT_DATE_FORMAT;
  const locale = useLocale();
  const t = useTranslations("common");
  const [selected, setSelected] = useState<Date | undefined>(() => toDate(defaultValue));
  const [text, setText] = useState(() => { const d = toDate(defaultValue); return d ? formatLocalDate(d, fmt) : ""; });
  const [month, setMonth] = useState<Date>(() => toDate(defaultValue) ?? new Date());
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const apply = (d: Date | undefined) => {
    setSelected(d);
    setText(d ? formatLocalDate(d, fmt) : "");
    if (d) setMonth(d);
  };

  function place() {
    const r = root.current?.getBoundingClientRect();
    if (!r) return;
    if (r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return; }
    const height = 392;
    const up = window.innerHeight - r.bottom < height && r.top > window.innerHeight - r.bottom;
    setPos({ top: up ? Math.max(8, r.top - height - 6) : r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 328)) });
  }
  const show = () => { if (!open) { place(); setOpen(true); } };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!root.current?.contains(n) && !panel.current?.contains(n)) setOpen(false);
    };
    const follow = (e: Event) => { if (!panel.current?.contains(e.target as Node)) place(); };
    document.addEventListener("mousedown", away);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", place);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("scroll", follow, true); window.removeEventListener("resize", place); };
  }, [open]);

  // Lets other components (e.g. the AI receipt reader) set this date: window.dispatchEvent(new CustomEvent("bp:set-date", { detail: { name, value } }))
  useEffect(() => {
    const onSet = (e: Event) => {
      const d = (e as CustomEvent<{ name: string; value: string }>).detail;
      if (d?.name === name) apply(toDate(d.value));
    };
    window.addEventListener("bp:set-date", onSet);
    return () => window.removeEventListener("bp:set-date", onSet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, fmt]);

  function typed(e: React.ChangeEvent<HTMLInputElement>) {
    let digits = e.target.value.replace(/\D/g, "");
    // Deleting a slash would put it straight back: treat it as deleting the digit before it.
    if (e.target.value.length < text.length && digits === text.replace(/\D/g, "")) digits = digits.slice(0, -1);
    const next = mask(digits, fmt);
    setText(next);
    const d = parseTyped(next, fmt);
    setSelected(d);
    if (d) setMonth(d);
    show();
  }

  const placeholder = fmt.toLowerCase();
  return (
    <div ref={root} className="relative">
      <input type="hidden" name={name} value={selected ? toIso(selected) : ""} />
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden />
        <input
          ref={field} id={id} type="text" role="combobox" inputMode="numeric" autoComplete="off" value={text} placeholder={placeholder} required={required}
          maxLength={10} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-calendar`} onChange={typed} onClick={show} onFocus={show}
          onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } else if (e.key === "ArrowDown") show(); }}
          className={cn(
            "h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-9 text-sm text-fg placeholder:text-muted transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            open && "border-primary ring-2 ring-primary/30", className,
          )}
        />
        {text && (
          <button type="button" aria-label={t("clearDate")} onClick={() => { apply(undefined); field.current?.focus(); }} className="absolute right-2 top-2 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {open && pos && (
        <div
          ref={panel} id={`${id}-calendar`} role="dialog" aria-label={t("pickDate")} style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="bp-datepicker bp-pop z-[60] w-[20.5rem] max-w-[calc(100vw-1rem)] rounded-2xl border border-line bg-surface p-3 shadow-lg"
        >
          <DayPicker
            mode="single" selected={selected} month={month} onMonthChange={setMonth}
            onSelect={(d) => { apply(d); setOpen(false); field.current?.focus(); }}
            weekStartsOn={0} locale={locale === "es" ? es : enUS} captionLayout="dropdown"
            startMonth={new Date(1990, 0)} endMonth={new Date(2100, 11)} components={{ Dropdown: MenuDropdown }}
          />
          <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
            <button type="button" onClick={() => { apply(undefined); setOpen(false); field.current?.focus(); }} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">{t("clearDate")}</button>
            <button type="button" onClick={() => { apply(new Date()); setOpen(false); field.current?.focus(); }} className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-soft">{t("today")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
