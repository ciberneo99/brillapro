import Link from "next/link";
import { ClickableRow } from "@/components/ClickableRow";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Paperclip } from "lucide-react";
import { CategoryPicker } from "@/components/bank/CategoryPicker";
import { ExpensesTabs } from "@/components/expenses/ExpensesTabs";
import { reportInPlan } from "@/modules/reports/catalog";
import { Button, Card } from "@/components/ui";
import { formatDateOnly } from "@/lib/dates";
import { addDays, addMonths, todayIso } from "@/lib/calendar";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { expenseSummary, listCategories, listExpenses, PAGE_SIZE } from "@/modules/expenses/queries";

export const metadata = { title: "Expenses" };
type SP = { month?: string; category?: string; page?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "expenses:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("expenses");
  const tb = await getTranslations("expensesBank");
  const showBank = can(ctx.role, "bank:read") && reportInPlan("bank_reports", ctx.planId);
  const cur = ctx.settings.currency;
  const today = todayIso(ctx.settings.timezone);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const first = `${month}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const categoryId = sp.category && UUID.test(sp.category) ? sp.category : undefined;

  const categories = await listCategories();
  const categoryIds = categoryId ? [categoryId, ...categories.filter((c) => categories.find((p) => p.id === categoryId)?.name === c.parent).map((c) => c.id)] : undefined;
  const [{ rows, total, page }, summary] = await Promise.all([
    listExpenses({ from: first, to: last, categoryIds, page: Number(sp.page) || 1 }),
    expenseSummary(first, last),
  ]);
  const monthTotal = summary.reduce((s, r) => s + r.total, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const monthLabel = new Intl.DateTimeFormat(ctx.settings.doc_locale === "es" ? "es-US" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));
  const href = (o: { month?: string; category?: string; page?: string }) => {
    const p = new URLSearchParams();
    p.set("month", o.month ?? month);
    if ((o.category ?? categoryId) && o.category !== "") p.set("category", (o.category ?? categoryId)!);
    if (o.page) p.set("page", o.page);
    return `/expenses?${p.toString()}`;
  };
  const btn = "bp-fx inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-primary hover:bg-primary-soft";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex gap-2">
          {can(ctx.role, "expenses:write") && <Link href="/expenses/new" className={btn} title={tb("uploadReceiptTop")}><Paperclip className="mr-2 h-4 w-4" aria-hidden />{tb("uploadReceiptTop")}</Link>}
          {can(ctx.role, "settings:read") && <Link href="/settings/expense-categories" className={btn}>{t("categories")}</Link>}
          {can(ctx.role, "expenses:write") && <Link href="/expenses/new" className="bp-fx bp-fx-solid inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover">{t("new")}</Link>}
        </div>
      </div>

      {showBank && <ExpensesTabs active="expenses" />}

      <div className="flex items-center gap-2">
        <Link href={href({ month: addMonths(first, -1).slice(0, 7), page: "" })} className={btn} aria-label={t("prevMonth")}>←</Link>
        <p className="min-w-40 text-center font-medium capitalize">{monthLabel}</p>
        <Link href={href({ month: addMonths(first, 1).slice(0, 7), page: "" })} className={btn} aria-label={t("nextMonth")}>→</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card accent="rose"><p className="text-sm text-muted">{t("monthTotal")}</p><p className="mt-1 text-2xl font-semibold">{formatMoney(monthTotal, cur)}</p></Card>
        <Card accent="amber" className="lg:col-span-2">
          <p className="mb-2 text-sm text-muted">{t("byCategory")}</p>
          {summary.length === 0 ? <p className="text-sm text-muted">—</p> : (
            <ul className="space-y-1 text-sm">
              {summary.map((r) => (
                <li key={r.category_id} className="flex justify-between gap-3">
                  <span>{r.name} <span className="text-muted">({r.entries})</span></span>
                  <span className="font-medium">{formatMoney(r.total, cur)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <form key={categoryId ?? "all"} action="/expenses" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="month" value={month} />
        <CategoryPicker name="category" defaultValue={categoryId ?? ""} allowParents choices={categories.map((c) => ({ id: c.id, name: c.name, parent: c.parent }))}
          extras={[{ value: "", label: t("all") }]} placeholder={t("all")} ariaLabel={t("category")} className="w-72" />
        <Button type="submit" variant="secondary">{t("apply")}</Button>
        {categoryId && <Link href={href({ category: "", page: "" })} className={btn}>{t("clear")}</Link>}
      </form>

      {rows.length === 0 ? (
        <Card className="text-center"><p className="font-medium">{t("empty")}</p><p className="mt-1 text-sm text-muted">{t("emptyBody")}</p></Card>
      ) : (
        <Card accent="green" className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase text-muted">
              <tr><th className="p-3">{t("date")}</th><th className="p-3">{t("vendor")}</th><th className="p-3">{t("category")}</th><th className="p-3">{t("receipt")}</th><th className="p-3 text-right">{t("amount")}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <ClickableRow key={r.id} href={`/expenses/${r.id}`} className="hover:bg-surface-2">
                  <td className="p-3"><Link href={`/expenses/${r.id}`} className="font-medium text-primary hover:underline">{formatDateOnly(r.expense_date, ctx.settings.date_format)}</Link></td>
                  <td className="p-3">{r.vendor || r.description || "—"}</td>
                  <td className="p-3">{r.categoryName}</td>
                  <td className="p-3">{r.receipt_path ? "📎" : ""}</td>
                  <td className="p-3 text-right font-medium">{formatMoney(r.amount_cents, cur)}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">{t("page", { page, pages })}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="bp-fx bp-fx-nobar rounded-lg border border-line px-3 py-1.5 hover:border-primary hover:bg-primary-soft" href={href({ page: String(page - 1) })}>{t("prev")}</Link>}
            {page < pages && <Link className="bp-fx bp-fx-nobar rounded-lg border border-line px-3 py-1.5 hover:border-primary hover:bg-primary-soft" href={href({ page: String(page + 1) })}>{t("next")}</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
