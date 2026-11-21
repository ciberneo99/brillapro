import Link from "next/link";
import { Maximize2, Trash2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Alert, Card } from "@/components/ui";
import { formatTimestamp } from "@/lib/dates";
import { sanitizeNoteHtml } from "@/lib/note-html";
import { deleteCustomerNote, saveCustomerNote } from "@/modules/notebook/actions";
import { listCustomerNotes } from "@/modules/notebook/queries";
import { NoteEditor } from "./NoteEditor";

/** "My Notes" on the customer page: private notes about this customer (only the author sees them). */
export async function CustomerNotes({ customerId, dateFormat, timezone, invalid }: { customerId: string; dateFormat: string; timezone: string; invalid?: boolean }) {
  const t = await getTranslations("customers.notes");
  const notes = await listCustomerNotes(customerId);
  return (
    <Card accent="teal" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <Link href="/notebook/notes" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><Maximize2 className="h-3.5 w-3.5" aria-hidden />{t("viewAll")}</Link>
      </div>
      {invalid && <Alert>{t("invalid")}</Alert>}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          {/* key = newest note: when a note is saved the list changes, so the editor remounts empty (its text lives in the browser, not in the form). */}
          <NoteEditor key={notes[0]?.id ?? "empty"} action={saveCustomerNote.bind(null, customerId)} placeholder={t("placeholder")} />
          <p className="text-xs text-muted">{t("private")}</p>
        </div>
        <div className="space-y-3">
          {notes.length === 0 && <p className="text-sm text-muted">{t("empty")}</p>}
          {notes.map((n, i) => (
            <article key={n.id} className={`rounded-xl border px-4 py-3 text-sm ${i % 2 === 0 ? "note-a" : "note-b"}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-muted">{formatTimestamp(n.created_at, dateFormat, timezone)}</p>
                <form action={deleteCustomerNote.bind(null, customerId, n.id)}>
                  <button type="submit" aria-label={t("delete")} className="rounded p-1 text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                </form>
              </div>
              {/* Safe: the text is re-sanitized to bold/italic/underline/lists only, with no attributes. */}
              <div className="note-prose mt-1" dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(n.body) }} />
            </article>
          ))}
        </div>
      </div>
    </Card>
  );
}
