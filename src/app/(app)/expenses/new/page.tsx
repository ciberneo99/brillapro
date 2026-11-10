import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field } from "@/components/ui";
import { ExpenseFields } from "@/components/expenses/ExpenseFields";
import { todayIso } from "@/lib/calendar";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { ReceiptScanner } from "@/components/expenses/ReceiptScanner";
import { createExpense } from "@/modules/expenses/actions";
import { receiptAiEnabled } from "@/modules/expenses/receipt-ai";
import { listCategories, recentJobs } from "@/modules/expenses/queries";

export const metadata = { title: "New expense" };

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "expenses:write")) redirect("/expenses");
  const sp = await searchParams;
  const t = await getTranslations("expenses");
  const [categories, jobs] = await Promise.all([listCategories({ activeOnly: true }), recentJobs()]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/expenses" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("new")}</h1>
      </div>
      {sp.error && <Alert>{t(sp.error === "type" ? "receiptType" : sp.error === "size" ? "receiptSize" : "invalid")}</Alert>}
      <Card accent="green">
        <form action={createExpense} className="space-y-4">
          <ExpenseFields categories={categories} jobs={jobs} today={todayIso(ctx.settings.timezone)} dateFormat={ctx.settings.date_format} currency={ctx.settings.currency} />
          <Field label={t("receipt")} htmlFor="receipt" hint={t("receiptHint")}>
            <ReceiptScanner aiEnabled={receiptAiEnabled()} />
          </Field>
          <Button type="submit">{t("save")}</Button>
        </form>
      </Card>
    </div>
  );
}
