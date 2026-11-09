import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Input } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { addCategory, updateCategory } from "@/modules/expenses/actions";
import { listCategories } from "@/modules/expenses/queries";

export const metadata = { title: "Expense categories" };

export default async function ExpenseCategoriesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "expenses:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("expenses");
  const canEdit = can(ctx.role, "settings:write");
  const categories = await listCategories();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/expenses" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("categories")}</h1>
        <p className="mt-1 text-sm text-muted">{t("categoriesIntro")}</p>
      </div>
      {sp.error && <Alert>{t(sp.error === "taken" ? "nameTaken" : "invalid")}</Alert>}
      {sp.saved && <Alert tone="success">{t("saved")}</Alert>}
      {!canEdit && <p className="text-sm text-muted">{t("readOnly")}</p>}

      <Card accent="amber" className="divide-y divide-line p-0">
        {categories.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 p-4">
            <form action={updateCategory.bind(null, c.id)} className="flex min-w-0 flex-1 items-center gap-2">
              <Input name="name" defaultValue={c.name} maxLength={80} disabled={!canEdit} aria-label={t("name")} className="max-w-xs" />
              {canEdit && <Button type="submit" variant="secondary">{t("saveName")}</Button>}
            </form>
            <span className={`rounded-full px-2 py-0.5 text-xs ${c.is_active ? "bg-success-soft text-success" : "bg-surface-2 text-muted"}`}>
              {c.is_active ? t("active") : t("inactive")}
            </span>
            {canEdit && (
              <form action={updateCategory.bind(null, c.id)}>
                <input type="hidden" name="is_active" value={String(!c.is_active)} />
                <Button type="submit" variant="ghost">{c.is_active ? t("deactivate") : t("activate")}</Button>
              </form>
            )}
          </div>
        ))}
      </Card>

      {canEdit && (
        <Card accent="green">
          <h2 className="mb-3 text-base font-semibold">{t("addCategory")}</h2>
          <form action={addCategory} className="flex flex-wrap gap-2">
            <Input name="name" required maxLength={80} aria-label={t("name")} className="max-w-sm" />
            <Button type="submit">{t("addButton")}</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
