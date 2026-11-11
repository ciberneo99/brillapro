import Link from "next/link";
import { reportInPlan } from "@/modules/reports/catalog";
import { redirect } from "next/navigation";
import { Eye, FileText, Search, Trash2 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { CategoryPicker, type CategoryChoice } from "@/components/bank/CategoryPicker";
import { EditTransactionDialog } from "@/components/bank/EditTransactionDialog";
import { ExpandableText } from "@/components/bank/ExpandableText";
import { StatementImport } from "@/components/bank/StatementImport";
import { CategoriesManager } from "@/components/bank/CategoriesManager";
import { ConfirmSubmit } from "@/components/bank/ConfirmSubmit";
import { Alert, Button, Input, cn } from "@/components/ui";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { VenmoUploader } from "@/components/venmo/VenmoUploader";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { bulkCategorize, bulkDelete, deleteTransaction, refreshBank, updateTransaction } from "@/modules/bank/actions";
import { BANK_PAGE_SIZE, categoryLabels, listBankCategories, listBankMonths, listStatements, listTransactions, sumTransactions } from "@/modules/bank/queries";
import { balanceSummary } from "@/modules/bank/summary";

export const metadata = { title: "Bank reports" };

type SP = { tab?: string; q?: string; type?: string; category?: string; month?: string; sort?: string; page?: string; edit?: string; error?: string; saved?: string };
const TONES = ["blue", "green", "violet", "amber", "rose", "teal"] as const;
const breakable = (label: string) => label.split("/").flatMap((p, i) => (i === 0 ? [p] : ["/", <wbr key={i} />, p]));
const chip = (tone: number) => ({ backgroundColor: `color-mix(in srgb, var(--c-${TONES[tone % TONES.length]}) 16%, transparent)`, color: `color-mix(in srgb, var(--c-${TONES[tone % TONES.length]}) 70%, var(--fg))` });

export default async function BankReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "venmo:read") || !reportInPlan("bank_reports", ctx.planId)) redirect("/reports");
  const canBank = can(ctx.role, "bank:read");
  const canWrite = can(ctx.role, "bank:write");
  const sp = await searchParams;
  const t = await getTranslations("reports");
  const tb = await getTranslations("bank");
  const tv = await getTranslations("venmo");
  const tab = canBank && (sp.tab === "categories" || sp.tab === "venmo") ? sp.tab : canBank ? "transactions" : "venmo";

  const tabs = [
    ...(canBank ? [{ id: "transactions", label: tb("tabs.transactions") }, { id: "categories", label: tb("tabs.categories") }] : []),
    { id: "venmo", label: tb("tabs.venmo") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-muted hover:text-fg">← {t("backToReports")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("items.bank_reports.title")}</h1>
        <p className="mt-1 text-sm text-muted">{tb("intro")}</p>
      </div>
      <nav className="flex gap-1 border-b border-line" aria-label={t("items.bank_reports.title")}>
        {tabs.map((x) => (
          <Link key={x.id} href={x.id === "transactions" ? "/reports/bank" : `/reports/bank?tab=${x.id}`} aria-current={tab === x.id ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium", tab === x.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>{x.label}</Link>
        ))}
      </nav>
      {tab === "venmo" && (<><p className="text-sm text-muted">{tv("intro")}</p><VenmoUploader currency={ctx.settings.currency} dateFormat={ctx.settings.date_format} /></>)}
      {tab === "categories" && <CategoriesManager sp={sp} canWrite={canWrite} tenantId={ctx.tenant.id} back="/reports/bank?tab=categories" />}
      {tab === "transactions" && <TransactionsTab sp={sp} canWrite={canWrite} tenantId={ctx.tenant.id} currency={ctx.settings.currency} dateFormat={ctx.settings.date_format} />}
    </div>
  );
}

async function TransactionsTab({ sp, canWrite, tenantId, currency, dateFormat }: { sp: SP; canWrite: boolean; tenantId: string; currency: string; dateFormat: string }) {
  const tb = await getTranslations("bank");
  const tr = await getTranslations("reports");
  const locale = await getLocale();
  const cats = await listBankCategories(tenantId, locale);
  const labels = categoryLabels(cats);
  const active = cats.filter((c) => c.is_active);
  const choices: CategoryChoice[] = active.map((c) => ({ id: c.id, name: c.name, parent: c.parent_id ? labels.get(c.id)!.parent : null }));
  const type = sp.type === "in" || sp.type === "out" ? sp.type : undefined;
  const sort = sp.sort === "asc" ? "asc" : "desc";
  const filterIds = sp.category && sp.category !== "none" ? [sp.category, ...cats.filter((c) => c.parent_id === sp.category).map((c) => c.id)] : undefined;
  const filters = { q: sp.q, type, category: sp.category, month: sp.month, sort } as const;
  const [{ rows, total, page }, months, sums] = await Promise.all([
    listTransactions({ ...filters, page: Number(sp.page) || 1 }, filterIds), listBankMonths(), sumTransactions(filters, filterIds),
  ]);
  const pages = Math.max(1, Math.ceil(total / BANK_PAGE_SIZE));
  // The bank's balances only make sense for the whole period, not for a search or category.
  const summary = sp.q || type || sp.category ? null : balanceSummary(await listStatements(), sp.month, sums.deposits, sums.withdrawals);
  const m = (c: number) => formatMoney(c, currency);
  const params = (over: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, type, category: sp.category, month: sp.month, sort: sp.sort, ...over })) if (v) u.set(k, v);
    const s = u.toString();
    return `/reports/bank${s ? `?${s}` : ""}`;
  };
  const pdfHref = (extra = "") => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, type, category: sp.category, month: sp.month, sort: sp.sort })) if (v) u.set(k, v);
    if (extra) u.set("download", "1");
    const qs = u.toString();
    return `/reports/bank/pdf${qs ? `?${qs}` : ""}`;
  };
  const here = params({ page: page > 1 ? String(page) : undefined });
  const monthLabel = (ym: string) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
  const filtered = Boolean(sp.q || type || sp.category || sp.month);

  return (
    <div className="space-y-6">
      {sp.error === "invalid" && <Alert>{tb("errors.invalid")}</Alert>}
      {sp.error === "select" && <Alert>{tb("errors.select")}</Alert>}
      {sp.saved && <Alert tone="success">{tb("saved")}</Alert>}
      {canWrite && <StatementImport categories={choices} currency={currency} dateFormat={dateFormat} />}

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="space-y-4 px-5 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">{tb("title", { count: total })}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <a href={pdfHref()} target="_blank" rel="noopener" className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"><Eye className="mr-2 h-4 w-4" aria-hidden />{tr("previewPdf")}</a>
              <a href={pdfHref("download=1")} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90"><FileText className="mr-2 h-4 w-4" aria-hidden />{tr("downloadPdf")}</a>
            </div>
            <p className="text-sm text-muted">
              <span className="font-medium text-success">{m(sums.deposits)}</span> {tb("cols.deposits").toLowerCase()} · <span className="font-medium text-danger">{m(sums.withdrawals)}</span> {tb("cols.withdrawals").toLowerCase()}
            </p>
          </div>
          <form method="get" key={[sp.q, type, sort, sp.category, sp.month].join("|")} className="grid gap-2 md:grid-cols-[1fr_repeat(4,minmax(9rem,auto))_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden />
              <Input name="q" defaultValue={sp.q} placeholder={tb("search")} aria-label={tb("search")} className="pl-9" />
            </div>
            <SelectMenu name="type" defaultValue={type ?? ""} ariaLabel={tb("filters.type")} options={[{ value: "", label: tb("filters.allTypes") }, { value: "in", label: tb("cols.deposits") }, { value: "out", label: tb("cols.withdrawals") }]} />
            <SelectMenu name="sort" defaultValue={sort} ariaLabel={tb("filters.sort")} options={[{ value: "desc", label: tb("filters.newest") }, { value: "asc", label: tb("filters.oldest") }]} />
            <CategoryPicker choices={choices} name="category" defaultValue={sp.category ?? ""} ariaLabel={tb("filters.category")} placeholder={tb("filters.allCategories")} allowParents extras={[{ value: "", label: tb("filters.allCategories") }, { value: "none", label: tb("uncategorized") }]} />
            <SelectMenu name="month" defaultValue={sp.month ?? ""} ariaLabel={tb("filters.month")} options={[{ value: "", label: tb("filters.allMonths") }, ...months.map((x) => ({ value: x, label: monthLabel(x) }))]} />
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">{tb("filters.apply")}</Button>
              {filtered && <Link href="/reports/bank" className="inline-flex h-10 items-center rounded-lg px-3 text-sm text-muted hover:bg-surface-2">{tb("filters.clear")}</Link>}
            </div>
          </form>
        </div>

        {summary && (
          <div className="border-t border-line">
            <dl className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              {[
                { label: tb("summary.previous"), value: summary.previousCents, tone: "" },
                { label: tb("cols.deposits"), value: summary.depositsCents, tone: "text-success" },
                { label: tb("cols.withdrawals"), value: summary.withdrawalsCents, tone: "text-danger" },
                { label: tb("summary.ending"), value: summary.endingCents, tone: "" },
              ].map((x) => (
                <div key={x.label} className="px-5 py-4">
                  <dt className="text-sm text-muted">{x.label}</dt>
                  <dd className={cn("mt-1 text-2xl font-semibold tabular-nums", x.tone)}>{m(x.value)}</dd>
                </div>
              ))}
            </dl>
            {summary.differenceCents !== null && (
              <p className={cn("border-t border-line px-5 py-3 text-sm font-medium", summary.differenceCents === 0 ? "text-success" : "text-danger")}>
                {summary.differenceCents === 0 ? tb("summary.matches") : tb("summary.differs", { bank: m(summary.bankEndingCents ?? 0), diff: m(Math.abs(summary.differenceCents)) })}
              </p>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="border-t border-line px-5 py-10 text-center text-sm text-muted">{filtered ? tb("emptyFiltered") : tb("empty")}</p>
        ) : (
          <form className="border-t border-line">
            <input type="hidden" name="back" value={here} />
            <button type="submit" hidden tabIndex={-1} aria-hidden formAction={refreshBank} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] table-fixed text-sm">
                <colgroup>
                  {canWrite && <col className="w-10" />}<col className="w-24" /><col /><col className="w-40" /><col className="w-28" /><col className="w-28" /><col className="w-28" />{canWrite && <col className="w-20" />}
                </colgroup>
                <thead>
                  <tr className="border-b border-line text-left text-sm text-muted">
                    {canWrite && <th className="px-4 py-3"><span className="sr-only">{tb("select")}</span></th>}
                    <th className="px-3 py-3 font-semibold">{tb("cols.date")}</th><th className="px-3 py-3 font-semibold">{tb("cols.description")}</th>
                    <th className="px-3 py-3 font-semibold">{tb("cols.category")}</th>
                    <th className="px-3 py-3 text-right font-semibold">{breakable(tb("cols.deposits"))}</th><th className="px-3 py-3 text-right font-semibold">{breakable(tb("cols.withdrawals"))}</th>
                    <th className="px-3 py-3 text-right font-semibold">{tb("cols.balance")}</th>
                    {canWrite && <th className="px-3 py-3"><span className="sr-only">{tb("actions")}</span></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => {
                    const cat = r.category_id ? labels.get(r.category_id) : null;
                    return (
                      <tr key={r.id} className="align-top hover:bg-surface-2/60">
                        {canWrite && <td className="px-4 py-3"><input type="checkbox" name="ids" value={r.id} aria-label={r.description} /></td>}
                        <td className="whitespace-nowrap px-3 py-3">{formatDateOnly(r.tx_date, dateFormat)}</td>
                        <td className="px-3 py-3"><ExpandableText text={r.description} /></td>
                        <td className="px-3 py-3">
                              {cat ? <span className="inline-block max-w-full truncate rounded-full px-2.5 py-1 align-middle text-xs font-medium" style={chip(cat.tone)} title={cat.parent ?? undefined}>{cat.label}</span> : <span className="text-xs text-muted">{tb("uncategorized")}</span>}
                            </td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums text-success">{r.amount_cents > 0 ? m(r.amount_cents) : ""}</td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums text-danger">{r.amount_cents < 0 ? m(-r.amount_cents) : ""}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted">{r.balance_cents === null ? "" : m(r.balance_cents)}</td>
                        {canWrite && (
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-1">
                              <EditTransactionDialog
                                tx={{ id: r.id, date: r.tx_date, description: r.description, amountCents: r.amount_cents, categoryId: r.category_id, notes: r.notes }}
                                choices={choices} action={updateTransaction.bind(null, r.id)} back={here} dateFormat={dateFormat}
                              />
                              <ConfirmSubmit message={tb("confirmDelete")} formAction={deleteTransaction.bind(null, r.id)} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-danger" aria-label={tb("delete")}><Trash2 className="h-4 w-4" aria-hidden /></ConfirmSubmit>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {canWrite && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-5 py-3">
                <span className="text-sm text-muted">{tb("bulk.label")}</span>
                <div className="w-60"><CategoryPicker choices={choices} name="bulk_category" ariaLabel={tb("bulk.category")} placeholder={tb("bulk.choose")} extras={[{ value: "none", label: tb("uncategorized") }]} /></div>
                <Button type="submit" variant="secondary" formAction={bulkCategorize}>{tb("bulk.apply")}</Button>
                <ConfirmSubmit message={tb("bulk.confirmDelete")} formAction={bulkDelete} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-danger hover:bg-surface">{tb("bulk.delete")}</ConfirmSubmit>
              </div>
            )}
          </form>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
            <span className="text-muted">{tb("page", { page, pages })}</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={params({ page: String(page - 1) })} className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2">{tb("prev")}</Link>}
              {page < pages && <Link href={params({ page: String(page + 1) })} className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2">{tb("next")}</Link>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
