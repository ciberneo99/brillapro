import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Input } from "@/components/ui";
import { OwnNoteCard } from "@/components/notebook/OwnNoteCard";
import { RichTextBox } from "@/components/notebook/RichTextBox";
import { formatTimestamp } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { deleteNote, saveNote } from "@/modules/notebook/actions";
import { listNotes } from "@/modules/notebook/queries";

export const metadata = { title: "My Notes" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "notebook:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("notes");
  const notes = await listNotes();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/notebook" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("private")}</p>
      </div>
      {sp.error && <Alert>{t("invalid")}</Alert>}

      <Card accent="green">
        {/* key = number of notes: saving adds one, so the form remounts empty; a rejected save keeps what was typed. */}
        <form key={notes.length} action={saveNote.bind(null, null)} className="space-y-3">
          <Input name="title" maxLength={120} placeholder={t("titlePlaceholder")} aria-label={t("titlePlaceholder")} />
          <RichTextBox placeholder={t("bodyPlaceholder")} />
          <Button type="submit">{t("add")}</Button>
        </form>
      </Card>

      {notes.length === 0 && <p className="text-center text-sm text-muted">{t("empty")}</p>}
      {notes.map((n, i) => (
        <OwnNoteCard
          key={`${n.id}-${n.updated_at}`}
          title={n.title} body={n.body} tone={i % 2 === 0 ? "note-a" : "note-b"}
          date={formatTimestamp(n.updated_at, ctx.settings.date_format, ctx.settings.timezone)}
          saveAction={saveNote.bind(null, n.id)} deleteAction={deleteNote.bind(null, n.id)}
          labels={{ menu: t("menu"), edit: t("edit"), delete: t("delete"), save: t("save"), cancel: t("cancel"), titlePlaceholder: t("titlePlaceholder"), bodyPlaceholder: t("bodyPlaceholder"), confirmDelete: t("confirmDelete") }}
        />
      ))}
    </div>
  );
}
