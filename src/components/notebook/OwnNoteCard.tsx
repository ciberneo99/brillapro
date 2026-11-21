"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { sanitizeNoteHtml } from "@/lib/note-html";
import { RichTextBox } from "./RichTextBox";

export type OwnNoteLabels = {
  menu: string; edit: string; delete: string; save: string; cancel: string;
  titlePlaceholder: string; bodyPlaceholder: string; confirmDelete: string;
};

/**
 * One of the user's own notes on "My Notes": a closed card (date, title, text) with a three-dots menu on the right
 * (Edit / Delete) so it takes little space. Edit opens the form inside the same card. The page gives the card a
 * key that changes when the note is saved, so it comes back closed.
 */
export function OwnNoteCard({
  title, body, date, tone, saveAction, deleteAction, labels,
}: {
  title: string; body: string; date: string; tone: "note-a" | "note-b";
  saveAction: (formData: FormData) => Promise<void>;
  deleteAction: () => Promise<void>;
  labels: OwnNoteLabels;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [menu]);

  const item = "bp-fx-item flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm";

  return (
    <Card accent="amber" className={tone}>
      <div className="flex items-start justify-between gap-3">
        <p className="pt-0.5 text-xs text-muted">{date}</p>
        {!editing && (
          <div ref={root} className="relative -mr-2 -mt-2">
            <button
              type="button" aria-label={labels.menu} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-fg/10 hover:text-fg"
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </button>
            {menu && (
              <div role="menu" className="bp-pop absolute right-0 z-30 mt-1 w-44 rounded-xl border border-line bg-surface p-1.5 text-fg shadow-lg">
                <button type="button" role="menuitem" onClick={() => { setMenu(false); setEditing(true); }} className={`${item} hover:bg-primary-soft hover:text-primary`}>
                  <Pencil className="h-4 w-4 shrink-0" aria-hidden />{labels.edit}
                </button>
                <form action={deleteAction} onSubmit={(e) => { if (!window.confirm(labels.confirmDelete)) e.preventDefault(); }}>
                  <button type="submit" role="menuitem" className={`${item} text-danger hover:bg-danger-soft`}>
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden />{labels.delete}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <form action={saveAction} className="mt-2 space-y-3">
          <Input name="title" defaultValue={title} maxLength={120} aria-label={labels.titlePlaceholder} />
          <RichTextBox placeholder={labels.bodyPlaceholder} initialHtml={body ? sanitizeNoteHtml(body) : ""} minHeight="min-h-32" />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">{labels.save}</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{labels.cancel}</Button>
          </div>
        </form>
      ) : (
        <>
          {title && <h2 className="mt-1 text-sm font-semibold">{title}</h2>}
          {body && <div className="note-prose mt-1 text-sm" dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(body) }} />}
        </>
      )}
    </Card>
  );
}
