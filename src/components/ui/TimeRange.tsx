"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Clock, X } from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "next-intl";

const STEP = 15;
const DURATIONS = [60, 120, 180, 240, 360, 480];

const toMin = (v: string) => (/^\d{2}:\d{2}$/.test(v) ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5)) : null);
const toVal = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function label(m: number) {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
function dur(m: number) {
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
}
/** "930", "9:30", "9:30 pm", "2p", "14:00" -> minutes since midnight, or null. */
function parse(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/\./g, "");
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*([ap])?m?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  if (mm > 59) return null;
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3] === "p" ? 12 : 0); }
  else if (h > 23) return null;
  return h * 60 + mm;
}

function TimeBox({
  id, name, value, onChange, options, placeholder, ariaLabel, hint,
}: {
  id: string; name: string; value: number | null; onChange: (m: number | null) => void; options: number[];
  placeholder: string; ariaLabel: string; hint?: (m: number) => string | null;
}) {
  const [text, setText] = useState(value == null ? "" : label(value));
  const [open, setOpen] = useState(false);
  const [bad, setBad] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => { setText(value == null ? "" : label(value)); setBad(false); }, [value]);

  useEffect(() => {
    if (!open) return;
    const target = value ?? 9 * 60;
    const i = options.findIndex((o) => o >= target);
    (list.current?.children[Math.max(0, i)] as HTMLElement | undefined)?.scrollIntoView({ block: "center" });
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) { setOpen(false); commit(); } };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commit() {
    if (text.trim() === "") { onChange(null); setBad(false); return; }
    const m = parse(text);
    if (m == null) { setBad(true); setText(value == null ? "" : label(value)); return; }
    setBad(false);
    onChange(m);
  }
  function pick(m: number) { onChange(m); setOpen(false); }

  return (
    <div ref={root} className="relative min-w-0 flex-1">
      <input type="hidden" name={name} value={value == null ? "" : toVal(value)} />
      <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        id={id} type="text" inputMode="text" autoComplete="off" role="combobox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel} aria-invalid={bad || undefined}
        value={text} placeholder={placeholder}
        onChange={(e) => setText(e.target.value)} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); setOpen(false); } else if (e.key === "Escape") setOpen(false); }}
        className={clsx("bp-fx bp-fx-nobar h-11 w-full rounded-lg border bg-surface pl-9 pr-8 text-sm hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30", bad ? "border-danger" : "border-line")}
      />
      {value != null && (
        <button type="button" aria-label="×" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(null); setOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg">
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
      {open && (
        <ul ref={list} id={listId} role="listbox" aria-label={ariaLabel} className="bp-pop absolute z-30 mt-1 max-h-60 w-full min-w-44 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          {options.map((o) => (
            <li key={o} role="option" aria-selected={o === value}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}
                className={clsx("bp-fx-item flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-primary-soft hover:text-primary", o === value && "bg-primary-soft font-medium text-primary")}>
                <span>{label(o)}</span>
                {hint?.(o) && <span className="text-xs text-muted">{hint(o)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Start and end time as two type-or-pick boxes (15-minute list, or type "9", "930", "2pm") with one-tap duration chips.
 * Submits `HH:MM` (or empty) under the two names. Changing the start keeps the job's length.
 */
export function TimeRange({
  startName = "start_time", endName = "end_time", startLabel, endLabel, defaultStart, defaultEnd,
}: { startName?: string; endName?: string; startLabel: string; endLabel: string; defaultStart?: string | null; defaultEnd?: string | null }) {
  const t = useTranslations("jobs");
  const [start, setStart] = useState<number | null>(toMin(defaultStart?.slice(0, 5) ?? ""));
  const [end, setEnd] = useState<number | null>(toMin(defaultEnd?.slice(0, 5) ?? ""));
  const slots = Array.from({ length: (24 * 60) / STEP }, (_, i) => i * STEP);
  const endSlots = start == null ? slots : slots.filter((s) => s > start);

  function changeStart(m: number | null) {
    // Moving the start keeps the length of the job.
    if (m != null && start != null && end != null && end > start) setEnd(Math.min(m + (end - start), 24 * 60 - 1));
    setStart(m);
  }
  const invalid = start != null && end != null && end <= start;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor="start_time" className="block text-sm font-medium">{startLabel}</label>
          <TimeBox id="start_time" name={startName} value={start} onChange={changeStart} options={slots} placeholder="9:00 AM" ariaLabel={startLabel} />
        </div>
        <ArrowRight className="mb-3 h-4 w-4 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor="end_time" className="block text-sm font-medium">{endLabel}</label>
          <TimeBox id="end_time" name={endName} value={end} onChange={setEnd} options={endSlots} placeholder="11:00 AM" ariaLabel={endLabel} hint={start == null ? undefined : (m) => dur(m - start)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Duration">
        {DURATIONS.map((d) => {
          const on = start != null && end != null && end - start === d;
          return (
            <button key={d} type="button" disabled={start == null} onClick={() => start != null && setEnd(Math.min(start + d, 24 * 60 - 1))}
              className={clsx("bp-fx bp-fx-nobar rounded-full border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50",
                on ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:border-primary hover:bg-primary-soft")}>
              {dur(d)}
            </button>
          );
        })}
      </div>
      {invalid && <p role="alert" className="text-xs text-danger">{t("endAfterStart")}</p>}
    </div>
  );
}
