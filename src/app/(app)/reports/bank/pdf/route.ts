import { renderToBuffer } from "@react-pdf/renderer";
import { reportInPlan } from "@/modules/reports/catalog";
import { createElement } from "react";
import { getTranslations } from "next-intl/server";
import { todayIso } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getAppContext } from "@/lib/session";
import { categoryLabels, listBankCategories, listStatements, listTransactions, type TxRow } from "@/modules/bank/queries";
import { balanceSummary } from "@/modules/bank/summary";
import { ReportPdf } from "@/modules/reports/pdf";
import type { ReportResult } from "@/modules/reports/run";

export const runtime = "nodejs";
const MAX_ROWS = 5000;

/** The bank transactions currently on screen (same filters) as a printable PDF. */
export async function GET(req: Request) {
  const ctx = await getAppContext();
  if (!ctx || !can(ctx.role, "bank:read") || !reportInPlan("bank_reports", ctx.planId)) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const type = q.get("type") === "in" || q.get("type") === "out" ? (q.get("type") as "in" | "out") : undefined;
  const sort = q.get("sort") === "asc" ? "asc" : "desc";
  const month = /^\d{4}-\d{2}$/.test(q.get("month") ?? "") ? q.get("month")! : undefined;
  const category = q.get("category") ?? undefined;
  const t = await getTranslations("reports");
  const tb = await getTranslations("bank");
  const cats = await listBankCategories(ctx.tenant.id, "en");
  const labels = categoryLabels(cats);
  const ids = category && category !== "none" ? [category, ...cats.filter((c) => c.parent_id === category).map((c) => c.id)] : undefined;

  const all: TxRow[] = [];
  for (let page = 1; all.length < MAX_ROWS; page++) {
    const { rows } = await listTransactions({ q: q.get("q") ?? undefined, type, category, month, sort, page }, ids, 1000);
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  const deposits = all.reduce((a, r) => a + (r.amount_cents > 0 ? r.amount_cents : 0), 0);
  const withdrawals = all.reduce((a, r) => a + (r.amount_cents < 0 ? -r.amount_cents : 0), 0);
  const plain = !q.get("q") && !type && !category;
  const summary = plain ? balanceSummary(await listStatements(), month, deposits, withdrawals) : null;
  const result: ReportResult = {
    cols: [
      { key: "date", label: tb("cols.date"), kind: "date" },
      { key: "description", label: tb("cols.description"), kind: "text", wide: true },
      { key: "category", label: tb("cols.category"), kind: "text" },
      { key: "deposits", label: tb("cols.deposits").replace("/", " / "), kind: "money", positive: true },
      { key: "withdrawals", label: tb("cols.withdrawals").replace("/", " / "), kind: "money", negative: true },
      { key: "balance", label: tb("cols.balance"), kind: "money" },
    ],
    rows: all.map((r) => ({
      date: r.tx_date, description: r.description, category: r.category_id ? labels.get(r.category_id)?.label ?? "" : tb("uncategorized"),
      deposits: r.amount_cents > 0 ? r.amount_cents : null, withdrawals: r.amount_cents < 0 ? -r.amount_cents : null, balance: r.balance_cents,
    })),
    stats: summary
      ? [
          { label: tb("summary.previous"), value: summary.previousCents, kind: "money", hint: tb("summary.fromBank"), tone: "default" },
          { label: tb("cols.deposits"), value: deposits, kind: "money", hint: "", tone: "green" },
          { label: tb("cols.withdrawals"), value: withdrawals, kind: "money", hint: "", tone: "danger" },
          {
            label: tb("summary.ending"), value: summary.endingCents, kind: "money", tone: "default",
            hint: summary.differenceCents === null ? "" : summary.differenceCents === 0 ? tb("summary.matchesShort") : tb("summary.differsShort", { diff: formatMoney(Math.abs(summary.differenceCents), ctx.settings.currency) }),
          },
        ]
      : [
          { label: tb("cols.deposits"), value: deposits, kind: "money", hint: "", tone: "green" },
          { label: tb("cols.withdrawals"), value: withdrawals, kind: "money", hint: "", tone: "danger" },
          { label: tb("pdfCount"), value: all.length, kind: "int", hint: "", tone: "default" },
        ],
    tableTitle: tb("title", { count: all.length }),
  };

  const today = todayIso(ctx.settings.timezone);
  const locale = ctx.settings.doc_locale === "es" ? "es" : "en";
  const period = month
    ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))
    : t("range.all");
  const buffer = await renderToBuffer(
    createElement(ReportPdf, {
      company: ctx.tenant.name, title: tb("pdfTitle"), periodLabel: period, generatedOn: formatDateOnly(today, ctx.settings.date_format),
      result, currency: ctx.settings.currency, dateFormat: ctx.settings.date_format,
      labels: { period: t("pdf.period"), generated: t("pdf.generated"), page: locale === "es" ? "Página" : "Page", of: locale === "es" ? "de" : "of", transactions: (n: number) => t("transactionsCount", { count: n }) },
    }) as Parameters<typeof renderToBuffer>[0],
  );
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${q.has("download") ? "attachment" : "inline"}; filename="bank_transactions_${today}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
