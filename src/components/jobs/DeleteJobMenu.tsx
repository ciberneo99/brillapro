"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import clsx from "clsx";

export type DeleteJobLabels = {
  delete: string; one: string; following: string; series: string; confirmOne: string; confirmFollowing: string; confirmSeries: string;
};

/**
 * Red Delete button of a job. A single job asks for confirmation; a job that belongs to a recurring series opens a small menu:
 * this job, this and the following jobs, or the entire series.
 */
export function DeleteJobMenu({
  inSeries, labels, actions,
}: { inSeries: boolean; labels: DeleteJobLabels; actions: { one: () => Promise<void>; following?: () => Promise<void>; series?: () => Promise<void> } }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  const danger = "text-danger hover:border-danger hover:bg-danger-soft hover:text-danger";
  const confirmThen = (msg: string) => (e: React.FormEvent) => { if (!window.confirm(msg)) e.preventDefault(); };

  if (!inSeries) {
    return (
      <form action={actions.one} onSubmit={confirmThen(labels.confirmOne)}>
        <button type="submit" className={clsx("bp-fx bp-fx-danger inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium", danger)}>
          <Trash2 className="h-4 w-4" aria-hidden />{labels.delete}
        </button>
      </form>
    );
  }

  const item = "bp-fx-item flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-danger-soft hover:text-danger";
  return (
    <div ref={root} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={clsx("bp-fx bp-fx-danger inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium", danger)}>
        <Trash2 className="h-4 w-4" aria-hidden />{labels.delete}<ChevronDown className={clsx("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="bp-pop absolute right-0 z-30 mt-1 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          <form action={actions.one} onSubmit={confirmThen(labels.confirmOne)}><button type="submit" role="menuitem" className={item}>{labels.one}</button></form>
          {actions.following && <form action={actions.following} onSubmit={confirmThen(labels.confirmFollowing)}><button type="submit" role="menuitem" className={item}>{labels.following}</button></form>}
          {actions.series && <form action={actions.series} onSubmit={confirmThen(labels.confirmSeries)}><button type="submit" role="menuitem" className={item}>{labels.series}</button></form>}
        </div>
      )}
    </div>
  );
}
