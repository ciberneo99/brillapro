import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { activateTemplate, addItem, deleteItem, moveItem, updateItem, updateTemplate } from "@/modules/checklists/actions";
import { getTemplate, type TemplateItem } from "@/modules/checklists/queries";
import { listServiceTypes } from "@/modules/services/queries";
import { SavedToast } from "@/components/ui/SavedToast";

export const metadata = { title: "Checklist" };

export default async function TemplatePage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "checklists:read")) redirect("/dashboard");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const tpl = await getTemplate(id);
  if (!tpl) notFound();
  const t = await getTranslations("checklists");
  const canEdit = can(ctx.role, "checklists:write");
  const serviceName = (await listServiceTypes()).find((s) => s.id === tpl.service_type_id)?.name ?? "";

  // Group by category, keeping the stored order.
  const groups: { category: string; items: TemplateItem[] }[] = [];
  for (const it of tpl.items) {
    const g = groups.find((x) => x.category === it.category);
    if (g) g.items.push(it); else groups.push({ category: it.category, items: [it] });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/notebook/checklists" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{tpl.name}</h1>
        <p className="mt-1 text-sm text-muted">{serviceName} · {tpl.is_active ? t("activeNote") : t("inactiveNote")}</p>
      </div>
      {sp.error && <Alert>{t("invalid")}</Alert>}
      {sp.saved && <SavedToast>{t("saved")}</SavedToast>}
      {!canEdit && <p className="text-sm text-muted">{t("canEdit")}</p>}

      <Card accent="blue">
        <form action={updateTemplate.bind(null, tpl.id)} className="space-y-3">
          <Field label={t("templateName")} htmlFor="name">
            <Input id="name" name="name" defaultValue={tpl.name} required maxLength={120} disabled={!canEdit} />
          </Field>
          <Field label={t("instructions")} htmlFor="instructions">
            <textarea id="instructions" name="instructions" defaultValue={tpl.instructions ?? ""} maxLength={2000} rows={3} disabled={!canEdit}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm disabled:bg-surface-2" />
          </Field>
          {canEdit && <Button type="submit">{t("saveTemplate")}</Button>}
        </form>
        {canEdit && !tpl.is_active && (
          <form action={activateTemplate.bind(null, tpl.id)} className="mt-3">
            <Button type="submit" variant="secondary">{t("makeActive")}</Button>
          </form>
        )}
      </Card>

      <Card accent="teal" className="space-y-5">
        <h2 className="text-base font-semibold">{t("items")}</h2>
        {tpl.items.length === 0 && <p className="text-sm text-muted">{t("emptyItems")}</p>}
        {groups.map((g) => (
          <section key={g.category || "_"}>
            <h3 className="mb-2 text-sm font-semibold text-muted">{g.category || t("noCategory")}</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {g.items.map((it) => (
                <li key={it.id} className="p-3">
                  {canEdit ? (
                    <div className="space-y-2">
                      <form action={updateItem.bind(null, tpl.id, it.id)} className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr_auto]">
                        <Input name="category" defaultValue={it.category} maxLength={80} placeholder={t("category")} aria-label={t("category")} />
                        <Input name="title" defaultValue={it.title} required maxLength={200} aria-label={t("task")} />
                        <Input name="instructions" defaultValue={it.instructions ?? ""} maxLength={1000} placeholder={t("taskInstructions")} aria-label={t("taskInstructions")} />
                        <Button type="submit" variant="secondary">{t("saveTask")}</Button>
                      </form>
                      <div className="flex gap-1">
                        <form action={moveItem.bind(null, tpl.id, it.id, "up")}><Button type="submit" variant="ghost" aria-label={t("moveUp")}>↑</Button></form>
                        <form action={moveItem.bind(null, tpl.id, it.id, "down")}><Button type="submit" variant="ghost" aria-label={t("moveDown")}>↓</Button></form>
                        <form action={deleteItem.bind(null, tpl.id, it.id)}><Button type="submit" variant="ghost" className="text-danger">{t("deleteTask")}</Button></form>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm">{it.title}</p>
                      {it.instructions && <p className="text-xs text-muted">{it.instructions}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {canEdit && (
          <form action={addItem.bind(null, tpl.id)} className="grid gap-2 border-t border-line pt-4 sm:grid-cols-[10rem_1fr_1fr_auto]">
            <Input name="category" maxLength={80} placeholder={t("category")} aria-label={t("category")} list="cats" />
            <datalist id="cats">{groups.filter((g) => g.category).map((g) => <option key={g.category} value={g.category} />)}</datalist>
            <Input name="title" required maxLength={200} placeholder={t("task")} aria-label={t("task")} />
            <Input name="instructions" maxLength={1000} placeholder={t("taskInstructions")} aria-label={t("taskInstructions")} />
            <Button type="submit">{t("addTask")}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
