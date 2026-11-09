"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { enUS, es } from "react-day-picker/locale";
import { CalendarDays, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/components/ui";

const toDate = (iso: string): Date | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined; // local date: no timezone shift
};
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Larger, themed calendar picker. Weeks start on Monday. Submits an ISO date (yyyy-mm-dd) under `name`. */
export function DatePicker({ id, name, defaultValue = "" }: { id: string; name: string; defaultValue?: string }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const [selected, setSelected] = useState<Date | undefined>(() => toDate(defaultValue));
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = selected ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(selected) : t("pickDate");

  return (
    <div ref={root} className="relative">
      <input type="hidden" name={name} value={selected ? toIso(selected) : ""} />
      <div className="flex gap-2">
        <button
          ref={trigger} id={id} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-sm",
            selected ? "text-fg" : "text-muted",
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span className="truncate">{label}</span>
        </button>
        {selected && (
          <button type="button" aria-label={t("clearDate")} onClick={() => setSelected(undefined)} className="rounded-lg border border-line px-2.5 text-muted hover:bg-surface-2 hover:text-fg">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <div role="dialog" aria-label={t("pickDate")} className="bp-datepicker absolute left-0 z-30 mt-2 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-3 shadow-card">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => {
              setSelected(d);
              setOpen(false);
              trigger.current?.focus();
            }}
            defaultMonth={selected}
            weekStartsOn={1}
            locale={locale === "es" ? es : enUS}
            captionLayout="dropdown"
            startMonth={new Date(1990, 0)}
            endMonth={new Date(2100, 11)}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
