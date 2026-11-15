"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Briefcase, FileText, MoreVertical, Pencil, Trash2, User } from "lucide-react";
import clsx from "clsx";

export type CustomerMenuLabels = { menu: string; view: string; edit: string; newQuote: string; newJob: string; remove: string; confirmRemove: string };

/**
 * The Actions menu of a customer row: View, Edit, New quote, New job and Delete (red), each with an icon.
 * Opens in a panel that follows the button (so tables never clip it) and uses the app's glow on every item.
 * `removeAction` is a server action; customers are archived, never erased, so their history is kept.
 */
export function CustomerMenu({
  id, labels, canEdit, canQuote, canJob, removeAction,
}: { id: string; labels: CustomerMenuLabels; canEdit: boolean; canQuote: boolean; canJob: boolean; removeAction?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const W = 208;

  function place() {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    if (r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return; }
    const up = window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8)), up });
  }

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    const follow = (e: Event) => { if (!panel.current?.contains(e.target as Node)) place(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", place);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); window.removeEventListener("scroll", follow, true); window.removeEventListener("resize", place); };
  }, [open]);

  const item = "bp-fx-item flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-primary-soft hover:text-primary";
  const icon = "h-4 w-4 shrink-0";

  return (
    <>
      <button
        ref={trigger} type="button" aria-label={labels.menu} aria-haspopup="menu" aria-expanded={open}
        onClick={() => { if (open) setOpen(false); else { place(); setOpen(true); } }}
        className={clsx("bp-fx bp-fx-nobar inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent hover:border-primary hover:bg-primary-soft", open && "border-primary bg-primary-soft")}
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>
      {open && pos && (
        <div
          ref={panel} role="menu" data-no-row
          style={{ position: "fixed", left: pos.left, width: W, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          className={clsx("bp-pop z-[60] rounded-xl border border-line bg-surface p-1.5 text-left shadow-lg", pos.up && "bp-pop-up")}
        >
          <Link role="menuitem" href={`/customers/${id}`} className={item}><User className={icon} aria-hidden />{labels.view}</Link>
          {canEdit && <Link role="menuitem" href={`/customers/${id}/edit`} className={item}><Pencil className={icon} aria-hidden />{labels.edit}</Link>}
          {canQuote && <Link role="menuitem" href={`/quotes/new?customer=${id}`} className={item}><FileText className={icon} aria-hidden />{labels.newQuote}</Link>}
          {canJob && <Link role="menuitem" href={`/jobs/new?customer=${id}`} className={item}><Briefcase className={icon} aria-hidden />{labels.newJob}</Link>}
          {removeAction && (
            <>
              <div className="my-1 border-t border-line" />
              <form action={removeAction} onSubmit={(e) => { if (!window.confirm(labels.confirmRemove)) e.preventDefault(); }}>
                <button type="submit" role="menuitem" className={clsx(item, "text-danger hover:bg-danger-soft hover:text-danger")}><Trash2 className={icon} aria-hidden />{labels.remove}</button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
