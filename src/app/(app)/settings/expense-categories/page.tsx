import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CategoriesManager } from "@/components/bank/CategoriesManager";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";

export const metadata = { title: "Categories" };

/** The same category list as Bank Reports; changes here show up there and in Expenses. */
export default async function ExpenseCategoriesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "expenses:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("expenses");
  const canEdit = can(ctx.role, "bank:write");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/expenses" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("categories")}</h1>
        <p className="mt-1 text-sm text-muted">{t("categoriesIntro")}</p>
      </div>
      {!canEdit && <p className="text-sm text-muted">{t("readOnly")}</p>}
      <CategoriesManager sp={sp} canWrite={canEdit} tenantId={ctx.tenant.id} back="/settings/expense-categories" compact />
    </div>
  );
}
