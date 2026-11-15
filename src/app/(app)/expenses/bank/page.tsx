import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, FileText, Link2, Paperclip, Unlink, X } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { CategoryChoice } from "@/components/bank/CategoryPicker";
import { ConfirmSubmit } from "@/components/bank/ConfirmSubmit";
import { EditTransactionDialog } from "@/components/bank/EditTransactionDialog";
import { ExpandableText } from "@/components/bank/ExpandableText";
import { StatementImport } from "@/components/bank/StatementImport";
import { TxReceiptUpload } from "@/components/bank/TxReceiptUpload";
import { ExpensesTabs } from "@/components/expenses/ExpensesTabs";
import { Alert, Button, Card } from "@/components/ui";
import { addMonths, todayIso } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { updateTransaction } from "@/modules/bank/actions";
import { monthWithdrawals } from "@/modules/bank/expense-view";
import { categoryLabels, listBankCategories } from "@/modules/bank/queries";
import { autoMatchMonth, linkTxExpense, removeTxReceipt, unlinkTxExpense, uploadTxReceipt } from "@/modules/bank/receipts";
import { reportInPlan } from "@/modules/reports/catalog";

export const metadata = { title: "Expenses · Bank statement" };
type SP = { month?: string; missing?: string; error?: string; saved?: string; matched?: string };
const TONES = ["blue", "green", "violet", "amber", "rose", "teal"] as const;
const chip = (tone: number) => ({ backgroundColor: `color-mix(in srgb, var(--c-${TONES[tone % TONES.length]}) 16%, transparent)`, color: `color-mix(in srgb, var(--c-${TONES[tone % TONES.length]}) 70%, var(--fg))` });
const iconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-primary";

export default async function ExpensesBankPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "bank:read") || !reportInPlan("bank_reports", ctx.planId)) redirect("/expenses");
  const canWrite = can(ctx.role, "bank:write");
  const sp = await searchParams;
  const t = await getTranslations("expensesBank");
  const tr = await getTranslations("reports");
  const tb = await getTranslations("bank");
  const locale = await getLocale();
  const cur = ctx.settings.currency;
  const m = (c: number) => formatMoney(c, cur);

  const today = todayIso(ctx.settings.timezone);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const first = `${month}-01`;
  const onlyMissing = sp.missing === "1";
  const href = (o: { month?: string; missing?: string }) => {
    const p = new URLSearchParams({ month: o.month ?? month });
    if ((o.missing ?? (onlyMissing ? "1" : "")) === "1") p.set("missing", "1");
    return `/expenses/bank?${p.toString()}`;
  };
  const here = href({});
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));

  const cats = await listBankCategories(ctx.tenant.id, locale);
  const labels = categoryLabels(cats);
  const choices: CategoryChoice[] = cats.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name, parent: c.parent_id ? labels.get(c.id)!.parent : null }));
  const { rows, stats } = await monthWithdrawals(month, onlyMissing);
  const btn = "bp-fx inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-primary hover:bg-primary-soft";
  const err = sp.error === "type" ? t("errType") : sp.error === "size" ? t("errSize") : sp.error ? t("errGeneric") : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </div>
      <ExpensesTabs active="bank" />
      <p className="text-sm text-muted">{t("intro")}</p>

      {err && <Alert>{err}</Alert>}
      {sp.saved === "receipt" && <Alert tone="success">{t("savedReceipt")}</Alert>}
      {sp.saved === "receiptcat" && <Alert tone="success">{t("savedReceiptCat")}</Alert>}
      {sp.saved === "linked" && <Alert tone="success">{t("savedLinked")}</Alert>}
      {sp.saved === "1" && <Alert tone="success">{tb("saved")}</Alert>}
      {sp.matched !== undefined && <Alert tone="success">{t("matchedCount", { count: Number(sp.matched) || 0 })}</Alert>}

      {canWrite && <StatementImport categories={choices} currency={cur} dateFormat={ctx.settings.date_format} withdrawalsOnly />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href({ month: addMonths(first, -1).slice(0, 7) })} className={btn} aria-label={t("prevMonth")}>←</Link>
          <p className="min-w-40 text-center font-medium capitalize">{monthLabel}</p>
          <Link href={href({ month: addMonths(first, 1).slice(0, 7) })} className={btn} aria-label={t("nextMonth")}>→</Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/reports/bank/pdf?type=out&sort=asc&month=${month}`} target="_blank" rel="noopener" className={btn}><Eye className="mr-2 h-4 w-4" aria-hidden />{tr("previewPdf")}</a>
          <a href={`/reports/bank/pdf?type=out&sort=asc&month=${month}&download=1`} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90"><FileText className="mr-2 h-4 w-4" aria-hidden />{tr("downloadPdf")}</a>
          <Link href={href({ missing: onlyMissing ? "0" : "1" })} className={btn} aria-pressed={onlyMissing}>{onlyMissing ? t("showAll") : t("onlyMissing")}</Link>
          {canWrite && stats.suggested > 0 && (
            <form action={autoMatchMonth}>
              <input type="hidden" name="month" value={month} /><input type="hidden" name="back" value={here} />
              <Button type="submit" variant="secondary"><Link2 className="mr-1.5 h-4 w-4" aria-hidden />{t("autoMatch")}</Button>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card accent="rose"><p className="text-sm text-muted">{t("withdrawals", { count: stats.count })}</p><p className="mt-1 text-2xl font-semibold">{m(stats.total)}</p></Card>
        <Card accent="green"><p className="text-sm text-muted">{t("withReceipt")}</p><p className="mt-1 text-2xl font-semibold">{stats.withReceipt} / {stats.count}</p></Card>
        <Card accent="amber"><p className="text-sm text-muted">{t("toMatch")}</p><p className="mt-1 text-2xl font-semibold">{stats.suggested}</p></Card>
      </div>

      {rows.length === 0 ? (
        <Card className="text-center"><p className="font-medium">{onlyMissing ? t("emptyMissing") : t("empty")}</p><p className="mt-1 text-sm text-muted">{t("emptyBody")}</p></Card>
      ) : (
        <Card accent="green" className="overflow-x-auto p-0">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase text-muted">
              <tr>
                <th className="p-3">{tb("cols.date")}</th><th className="p-3">{tb("cols.description")}</th><th className="p-3">{tb("cols.category")}</th>
                <th className="p-3 text-right">{t("amount")}</th><th className="p-3">{t("receipt")}</th><th className="p-3">{t("match")}</th>{canWrite && <th className="p-3"><span className="sr-only">{tb("actions")}</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const cat = r.category_id ? labels.get(r.category_id) : null;
                return (
                  <tr key={r.id} className="align-top hover:bg-surface-2/60">
                    <td className="whitespace-nowrap p-3">{formatDateOnly(r.tx_date, ctx.settings.date_format)}</td>
                    <td className="max-w-72 p-3"><ExpandableText text={r.description} /></td>
                    <td className="p-3">{cat ? <span className="inline-block max-w-40 truncate rounded-full px-2.5 py-1 align-middle text-xs font-medium" style={chip(cat.tone)} title={cat.parent ?? undefined}>{cat.label}</span> : <span className="text-xs text-muted">{tb("uncategorized")}</span>}</td>
                    <td className="whitespace-nowrap p-3 text-right font-medium tabular-nums">{m(-r.amount_cents)}</td>
                    <td className="p-3">
                      {r.hasReceipt ? (
                        <div className="flex items-center gap-1">
                          {r.receiptUrl && <a href={r.receiptUrl} target="_blank" rel="noopener" className={iconBtn} title={t("viewReceipt")} aria-label={t("viewReceipt")}><Paperclip className="h-4 w-4 text-success" aria-hidden /></a>}
                          {canWrite && (
                            <form action={removeTxReceipt.bind(null, r.id)}>
                              <input type="hidden" name="back" value={here} />
                              <ConfirmSubmit message={t("confirmRemoveReceipt")} className={iconBtn} aria-label={t("removeReceipt")}><X className="h-4 w-4" aria-hidden /></ConfirmSubmit>
                            </form>
                          )}
                        </div>
                      ) : canWrite ? <TxReceiptUpload action={uploadTxReceipt.bind(null, r.id)} back={here} label={t("uploadReceipt")} /> : <span className="text-muted">—</span>}
                    </td>
                    <td className="p-3">
                      {r.linked ? (
                        <div className="flex items-center gap-1">
                          <Link href={`/expenses/${r.linked.id}`} className="font-medium text-primary hover:underline">{r.linked.vendor}</Link>
                          {canWrite && (
                            <form action={unlinkTxExpense.bind(null, r.id)}>
                              <input type="hidden" name="back" value={here} />
                              <button type="submit" className={iconBtn} title={t("unlink")} aria-label={t("unlink")}><Unlink className="h-4 w-4" aria-hidden /></button>
                            </form>
                          )}
                        </div>
                      ) : r.suggestion && canWrite ? (
                        <form action={linkTxExpense.bind(null, r.id, r.suggestion.id)}>
                          <input type="hidden" name="back" value={here} />
                          <button type="submit" className="inline-flex max-w-52 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-left text-xs font-medium hover:border-primary hover:bg-primary-soft hover:text-primary">
                            <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{t("linkTo", { vendor: r.suggestion.vendor, date: formatDateOnly(r.suggestion.expense_date, ctx.settings.date_format) })}</span>
                          </button>
                        </form>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    {canWrite && (
                      <td className="p-3">
                        <div className="flex justify-end">
                          <EditTransactionDialog
                            tx={{ id: r.id, date: r.tx_date, description: r.description, amountCents: r.amount_cents, categoryId: r.category_id, notes: r.notes }}
                            choices={choices} action={updateTransaction.bind(null, r.id)} back={here} dateFormat={ctx.settings.date_format}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
