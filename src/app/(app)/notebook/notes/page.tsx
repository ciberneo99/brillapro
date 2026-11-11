import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Input } from "@/components/ui";
import { formatTimestamp } from "@/lib/dates";
import { sanitizeNoteHtml } from "@/lib/note-html";
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
  const ta = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/notebook" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("private")}</p>
      </div>
      {sp.error && <Alert>{t("invalid")}</Alert>}

      <Card accent="green">
        <form action={saveNote.bind(null, null)} className="space-y-3">
          <Input name="title" maxLength={120} placeholder={t("titlePlaceholder")} aria-label={t("titlePlaceholder")} />
          <textarea name="body" rows={4} maxLength={10000} placeholder={t("bodyPlaceholder")} aria-label={t("bodyPlaceholder")} className={ta} />
          <Button type="submit">{t("add")}</Button>
        </form>
      </Card>

      {notes.length === 0 && <p className="text-center text-sm text-muted">{t("empty")}</p>}
      {notes.map((n) => n.customer_id ? (
        <Card key={n.id} accent="teal">
          <p className="text-xs text-muted">{formatTimestamp(n.updated_at, ctx.settings.date_format, ctx.settings.timezone)} · <Link href={`/customers/${n.customer_id}`} className="text-primary hover:underline">{t("aboutCustomer")}</Link></p>
          <div className="mt-1 text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(n.body) }} />
        </Card>
      ) : (
        <Card key={n.id} accent="amber">
          <form action={saveNote.bind(null, n.id)} className="space-y-3">
            <Input name="title" defaultValue={n.title} maxLength={120} aria-label={t("titlePlaceholder")} />
            <textarea name="body" rows={5} defaultValue={n.body} maxLength={10000} aria-label={t("bodyPlaceholder")} className={ta} />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">{t("updated", { date: formatTimestamp(n.updated_at, ctx.settings.date_format, ctx.settings.timezone) })}</span>
              <Button type="submit" variant="secondary">{t("save")}</Button>
            </div>
          </form>
          <form action={deleteNote.bind(null, n.id)} className="mt-1"><Button type="submit" variant="ghost" className="text-danger">{t("delete")}</Button></form>
        </Card>
      ))}
    </div>
  );
}
