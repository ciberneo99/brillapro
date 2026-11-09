import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field } from "@/components/ui";
import { ExpenseFields } from "@/components/expenses/ExpenseFields";
import { todayIso } from "@/lib/calendar";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { deleteExpense, removeReceipt, updateExpense, uploadReceipt } from "@/modules/expenses/actions";
import { getExpense, listCategories, receiptUrl, recentJobs } from "@/modules/expenses/queries";

export const metadata = { title: "Expense" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function ExpensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireContext();
  if (!can(ctx.role, "expenses:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("expenses");
  const expense = await getExpense(id);
  if (!expense) notFound();
  const canWrite = can(ctx.role, "expenses:write");
  const canDelete = can(ctx.role, "settings:write");
  const [categories, jobs, url] = await Promise.all([
    // Keep the current category selectable even if it was deactivated later.
    listCategories().then((all) => all.filter((c) => c.is_active || c.id === expense.category_id)),
    recentJobs(),
    receiptUrl(expense.receipt_path),
  ]);
  const err = sp.error === "type" ? "receiptType" : sp.error === "size" ? "receiptSize" : sp.error === "upload" ? "receiptUpload" : "invalid";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/expenses" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("detail")}</h1>
      </div>
      {sp.error && <Alert>{t(err)}</Alert>}
      {sp.saved && <Alert tone="success">{t("saved")}</Alert>}

      <Card accent="green">
        <form action={updateExpense.bind(null, id)} className="space-y-4">
          <fieldset disabled={!canWrite} className="space-y-4">
            <ExpenseFields categories={categories} jobs={jobs} value={expense} today={todayIso(ctx.settings.timezone)} dateFormat={ctx.settings.date_format} currency={ctx.settings.currency} />
          </fieldset>
          {canWrite && <Button type="submit">{t("save")}</Button>}
        </form>
      </Card>

      <Card accent="blue" className="space-y-3">
        <h2 className="text-base font-semibold">{t("receipt")}</h2>
        {url ? (
          <div className="flex flex-wrap items-center gap-3">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{t("viewReceipt")}</a>
            {canWrite && <form action={removeReceipt.bind(null, id)}><Button type="submit" variant="ghost" className="text-danger">{t("removeReceipt")}</Button></form>}
          </div>
        ) : (
          <p className="text-sm text-muted">{expense.receipt_path ? t("receiptUnavailable") : t("noReceipt")}</p>
        )}
        {canWrite && (
          <form action={uploadReceipt.bind(null, id)} className="space-y-2">
            <Field label={url ? t("replaceReceipt") : t("attachReceipt")} htmlFor="receipt" hint={t("receiptHint")}>
              <input id="receipt" name="receipt" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm" />
            </Field>
            <Button type="submit" variant="secondary">{t("upload")}</Button>
          </form>
        )}
      </Card>

      {canDelete && (
        <form action={deleteExpense.bind(null, id)}>
          <Button type="submit" variant="ghost" className="text-danger">{t("delete")}</Button>
        </form>
      )}
    </div>
  );
}
