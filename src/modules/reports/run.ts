import "server-only";
import { quoteNumber } from "@/lib/money";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type Kind = "text" | "date" | "money" | "int" | "pct";
export type Col = { key: string; label: string; kind: Kind; /** The cell links to the row's `_href`. */ link?: boolean; /** Shown in the positive (green) colour, like money received. */ positive?: boolean; /** Shown in red, like money paid out. */ negative?: boolean; /** Takes more width (long text such as a description). */ wide?: boolean };
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell> & { _bold?: boolean; _href?: string };
export type Tone = "default" | "green" | "accent" | "danger";
export type Stat = { label: string; value: number; kind: "int" | "money"; hint: string; tone: Tone };
export type Group = { label: string; count: number; totalCents: number; rows: Row[] };
export type ReportResult = {
  cols: Col[];
  rows: Row[];
  /** Grand totals row, shown at the bottom. */
  totals?: Row;
  /** Three headline figures above the table. */
  stats: Stat[];
  /** Rows split into labelled blocks (payments by method). The CSV keeps the flat `rows`. */
  groups?: Group[];
  /** Small summary table (payment method summary, expenses by category). */
  breakdown?: { title: string; cols: Col[]; rows: Row[] };
  /** Two short lists side by side above the main table (bank: income by category | expenses by category). */
  sideBySide?: { title: string; total: number; rows: { label: string; cents: number }[] }[];
  /** Heading of the main table. */
  tableTitle: string;
};

export type RunCtx = {
  supabase: Supabase;
  from: string;
  to: string;
  today: string;
  invoicePrefix: string;
  /** Payment method filter (payments report). */
  method?: string;
  /** Translates a column or label key from `reports.cols`. */
  t: (key: string) => string;
  /** Translates a payment method id. */
  methodName: (m: string) => string;
  status: (s: string) => string;
};

const LIMIT = 5000;
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const n = (v: unknown) => Number(v ?? 0);
const stat = (label: string, value: number, kind: Stat["kind"], hint: string, tone: Tone = "default"): Stat => ({ label, value, kind, hint, tone });

type Inv = { id: string; number: number; issue_date: string; due_date: string; customer_id: string; customer_name: string; display_status: string; status: string; total_cents: number; paid_cents: number; balance_cents: number };

/** Invoices issued in the range (sent or paid or void, never drafts). */
async function invoicesIn(c: RunCtx): Promise<Inv[]> {
  const { data } = await c.supabase
    .from("invoices_overview")
    .select("id,number,issue_date,due_date,customer_id,customer_name,display_status,status,total_cents,paid_cents,balance_cents")
    .neq("status", "draft").gte("issue_date", c.from).lte("issue_date", c.to).order("issue_date").order("number").limit(LIMIT);
  return ((data ?? []) as Inv[]).map((r) => ({ ...r, total_cents: n(r.total_cents), paid_cents: n(r.paid_cents), balance_cents: n(r.balance_cents) }));
}

const live = (rows: Inv[]) => rows.filter((r) => r.status !== "void");
const avg = (total: number, count: number) => (count ? Math.round(total / count) : 0);

async function invoiceDetails(c: RunCtx): Promise<ReportResult> {
  const inv = await invoicesIn(c);
  const ok = live(inv);
  const total = sum(ok, (r) => r.total_cents), paid = sum(ok, (r) => r.paid_cents), bal = sum(ok, (r) => r.balance_cents);
  return {
    tableTitle: c.t("invoiceList"),
    stats: [stat(c.t("invoices"), ok.length, "int", c.t("hintInvoices")), stat(c.t("totalInvoiced"), total, "money", c.t("hintInvoiced"), "green"), stat(c.t("balanceDue"), bal, "money", c.t("hintOpen"), bal > 0 ? "danger" : "default")],
    cols: [
      { key: "number", label: c.t("invoice"), kind: "text", link: true }, { key: "date", label: c.t("date"), kind: "date" }, { key: "due", label: c.t("due"), kind: "date" },
      { key: "customer", label: c.t("customer"), kind: "text" }, { key: "status", label: c.t("status"), kind: "text" },
      { key: "total", label: c.t("total"), kind: "money" }, { key: "paid", label: c.t("paid"), kind: "money" }, { key: "balance", label: c.t("balance"), kind: "money" },
    ],
    rows: inv.map((r) => ({
      number: quoteNumber(c.invoicePrefix, r.number), _href: `/invoices/${r.id}`, date: r.issue_date, due: r.due_date, customer: r.customer_name, status: c.status(r.display_status),
      total: r.total_cents, paid: r.paid_cents, balance: r.status === "void" ? 0 : r.balance_cents,
    })),
    totals: { number: c.t("totalRow"), total, paid, balance: bal },
  };
}

async function itemSales(c: RunCtx): Promise<ReportResult> {
  const ids = live(await invoicesIn(c)).map((r) => r.id);
  const items = new Map<string, { name: string; qty: number; revenue: number; invoices: Set<string> }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await c.supabase.from("invoice_lines").select("invoice_id,description,quantity,unit_price_cents").in("invoice_id", ids.slice(i, i + 200)).limit(LIMIT * 4);
    for (const l of data ?? []) {
      const key = String(l.description).trim().toLowerCase();
      const it = items.get(key) ?? { name: String(l.description).trim(), qty: 0, revenue: 0, invoices: new Set<string>() };
      it.qty += n(l.quantity); it.revenue += Math.round(n(l.quantity) * n(l.unit_price_cents)); it.invoices.add(l.invoice_id);
      items.set(key, it);
    }
  }
  const rows = [...items.values()].sort((a, b) => b.revenue - a.revenue);
  const revenue = sum(rows, (r) => r.revenue);
  return {
    tableTitle: c.t("itemList"),
    stats: [stat(c.t("items"), rows.length, "int", c.t("hintItems")), stat(c.t("unitsSold"), Math.round(sum(rows, (r) => r.qty)), "int", c.t("hintUnits")), stat(c.t("totalRevenue"), revenue, "money", c.t("hintRevenue"), "green")],
    cols: [
      { key: "item", label: c.t("item"), kind: "text" }, { key: "invoices", label: c.t("invoices"), kind: "int" },
      { key: "qty", label: c.t("qty"), kind: "int" }, { key: "revenue", label: c.t("revenue"), kind: "money" },
    ],
    rows: rows.map((r) => ({ item: r.name, invoices: r.invoices.size, qty: Math.round(r.qty * 100) / 100, revenue: r.revenue })),
    totals: { item: c.t("totalRow"), revenue },
  };
}

async function revenueByClient(c: RunCtx): Promise<ReportResult> {
  const by = new Map<string, { id: string; name: string; count: number; total: number; paid: number }>();
  for (const r of live(await invoicesIn(c))) {
    const x = by.get(r.customer_id) ?? { id: r.customer_id, name: r.customer_name, count: 0, total: 0, paid: 0 };
    x.count++; x.total += r.total_cents; x.paid += r.paid_cents;
    by.set(r.customer_id, x);
  }
  const rows = [...by.values()].sort((a, b) => b.total - a.total);
  const grand = sum(rows, (r) => r.total);
  return {
    tableTitle: c.t("clientList"),
    stats: [stat(c.t("clients"), rows.length, "int", c.t("hintClients")), stat(c.t("totalInvoiced"), grand, "money", c.t("hintInvoiced"), "green"), stat(c.t("averagePerClient"), avg(grand, rows.length), "money", c.t("hintPerClient"), "accent")],
    cols: [
      { key: "customer", label: c.t("customer"), kind: "text", link: true }, { key: "invoices", label: c.t("invoices"), kind: "int" },
      { key: "invoiced", label: c.t("invoiced"), kind: "money" }, { key: "paid", label: c.t("paid"), kind: "money" },
      { key: "balance", label: c.t("balance"), kind: "money" }, { key: "share", label: c.t("share"), kind: "pct" },
    ],
    rows: rows.map((r) => ({ customer: r.name, _href: `/customers/${r.id}`, invoices: r.count, invoiced: r.total, paid: r.paid, balance: r.total - r.paid, share: grand ? Math.round((r.total / grand) * 1000) / 10 : 0 })),
    totals: { customer: c.t("totalRow"), invoices: sum(rows, (r) => r.count), invoiced: grand, paid: sum(rows, (r) => r.paid), balance: grand - sum(rows, (r) => r.paid) },
  };
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

async function accountsAging(c: RunCtx): Promise<ReportResult> {
  const { data } = await c.supabase
    .from("invoices_overview").select("customer_id,customer_name,due_date,balance_cents")
    .eq("status", "sent").gt("balance_cents", 0).limit(LIMIT);
  const by = new Map<string, { id: string; name: string; b: number[] }>();
  for (const r of data ?? []) {
    const late = daysBetween(r.due_date, c.today);
    const bucket = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    const x = by.get(r.customer_id) ?? { id: r.customer_id, name: r.customer_name, b: [0, 0, 0, 0, 0] };
    x.b[bucket] += n(r.balance_cents);
    by.set(r.customer_id, x);
  }
  const rows = [...by.values()].map((x) => ({ ...x, total: sum(x.b, (v) => v) })).sort((a, b) => b.total - a.total);
  const col = (i: number) => sum(rows, (r) => r.b[i]);
  const outstanding = sum(rows, (r) => r.total);
  const overdue = outstanding - col(0);
  return {
    tableTitle: c.t("agingList"),
    stats: [stat(c.t("openInvoices"), (data ?? []).length, "int", c.t("hintOpenInvoices")), stat(c.t("outstanding"), outstanding, "money", c.t("hintOutstanding"), "green"), stat(c.t("overdue"), overdue, "money", c.t("hintOverdue"), overdue > 0 ? "danger" : "default")],
    cols: [
      { key: "customer", label: c.t("customer"), kind: "text", link: true }, { key: "current", label: c.t("notDue"), kind: "money" },
      { key: "d30", label: "1–30", kind: "money" }, { key: "d60", label: "31–60", kind: "money" }, { key: "d90", label: "61–90", kind: "money" },
      { key: "d90p", label: "90+", kind: "money" }, { key: "total", label: c.t("total"), kind: "money" },
    ],
    rows: rows.map((r) => ({ customer: r.name, _href: `/customers/${r.id}`, current: r.b[0], d30: r.b[1], d60: r.b[2], d90: r.b[3], d90p: r.b[4], total: r.total })),
    totals: { customer: c.t("totalRow"), current: col(0), d30: col(1), d60: col(2), d90: col(3), d90p: col(4), total: outstanding },
  };
}

export const isMethodCode = (m: string) => /^[a-z0-9_]{1,40}$/.test(m);

async function paymentsCollected(c: RunCtx): Promise<ReportResult> {
  let q = c.supabase.from("payments").select("invoice_id,amount_cents,paid_on,method,reference,notes").gte("paid_on", c.from).lte("paid_on", c.to);
  if (c.method && isMethodCode(c.method)) q = q.eq("method", c.method);
  const { data } = await q.order("paid_on", { ascending: false }).limit(LIMIT);
  const pays = data ?? [];
  const ids = [...new Set(pays.map((p) => p.invoice_id))];
  const info = new Map<string, { number: number; customer: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: inv } = await c.supabase.from("invoices_overview").select("id,number,customer_name").in("id", ids.slice(i, i + 200));
    for (const r of inv ?? []) info.set(r.id, { number: r.number, customer: r.customer_name });
  }
  const toRow = (p: (typeof pays)[number]): Row => ({
    date: p.paid_on, customer: info.get(p.invoice_id)?.customer ?? "",
    invoice: info.has(p.invoice_id) ? quoteNumber(c.invoicePrefix, info.get(p.invoice_id)!.number) : "", _href: `/invoices/${p.invoice_id}`,
    method: c.methodName(p.method), amount: n(p.amount_cents), notes: [p.reference, p.notes].filter(Boolean).join(" · "),
  });
  const total = sum(pays, (p) => n(p.amount_cents));
  const byMethod = new Map<string, typeof pays>();
  for (const p of pays) byMethod.set(p.method, [...(byMethod.get(p.method) ?? []), p]);
  const groups: Group[] = [...byMethod.entries()]
    .map(([m, list]) => ({ label: c.methodName(m), count: list.length, totalCents: sum(list, (p) => n(p.amount_cents)), rows: list.map(toRow) }))
    .sort((a, b) => b.totalCents - a.totalCents);
  return {
    tableTitle: c.t("paymentHistory"),
    stats: [
      stat(c.t("totalPayments"), pays.length, "int", c.t("hintTransactions")),
      stat(c.t("totalCollected"), total, "money", c.t("hintCollected"), "green"),
      stat(c.t("averagePayment"), avg(total, pays.length), "money", c.t("hintPerTransaction"), "accent"),
    ],
    cols: [
      { key: "date", label: c.t("date"), kind: "date" }, { key: "customer", label: c.t("client"), kind: "text" },
      { key: "invoice", label: c.t("invoiceNo"), kind: "text", link: true }, { key: "method", label: c.t("method"), kind: "text" },
      { key: "amount", label: c.t("amount"), kind: "money", positive: true }, { key: "notes", label: c.t("notes"), kind: "text" },
    ],
    rows: pays.map(toRow),
    groups,
    breakdown: {
      title: c.t("methodSummary"),
      cols: [{ key: "method", label: c.t("method"), kind: "text" }, { key: "count", label: c.t("transactions"), kind: "int" }, { key: "total", label: c.t("totalAmount"), kind: "money" }],
      rows: groups.map((g) => ({ method: g.label, count: g.count, total: g.totalCents })),
    },
  };
}

async function expensesIn(c: RunCtx) {
  const [{ data: ex }, { data: cats }] = await Promise.all([
    c.supabase.from("expenses").select("expense_date,vendor,description,amount_cents,payment_method,category_id").gte("expense_date", c.from).lte("expense_date", c.to).order("expense_date").limit(LIMIT),
    c.supabase.from("bank_categories").select("id,name,parent_id").limit(500),
  ]);
  const byId = new Map((cats ?? []).map((k) => [k.id, k]));
  const names = new Map((cats ?? []).map((k) => [k.id, k.parent_id && byId.get(k.parent_id) ? `${byId.get(k.parent_id)!.name}: ${k.name}` : (k.name as string)]));
  return (ex ?? []).map((e) => ({ ...e, amount_cents: n(e.amount_cents), category: names.get(e.category_id) ?? "" }));
}

async function expenseReport(c: RunCtx): Promise<ReportResult> {
  const ex = await expensesIn(c);
  const by = new Map<string, { count: number; total: number }>();
  for (const e of ex) { const x = by.get(e.category) ?? { count: 0, total: 0 }; x.count++; x.total += e.amount_cents; by.set(e.category, x); }
  const total = sum(ex, (e) => e.amount_cents);
  return {
    tableTitle: c.t("expenseList"),
    stats: [stat(c.t("expensesCount"), ex.length, "int", c.t("hintTransactions")), stat(c.t("totalSpent"), total, "money", c.t("hintSpent"), "danger"), stat(c.t("averageExpense"), avg(total, ex.length), "money", c.t("hintPerTransaction"), "accent")],
    cols: [
      { key: "date", label: c.t("date"), kind: "date" }, { key: "category", label: c.t("category"), kind: "text" }, { key: "vendor", label: c.t("vendor"), kind: "text" },
      { key: "description", label: c.t("description"), kind: "text" }, { key: "method", label: c.t("method"), kind: "text" }, { key: "amount", label: c.t("amount"), kind: "money" },
    ],
    rows: ex.map((e) => ({ date: e.expense_date, category: e.category, vendor: e.vendor, description: e.description ?? "", method: e.payment_method ? c.methodName(e.payment_method) : "", amount: e.amount_cents })),
    totals: { date: c.t("totalRow"), amount: total },
    breakdown: {
      title: c.t("byCategory"),
      cols: [{ key: "category", label: c.t("category"), kind: "text" }, { key: "count", label: c.t("transactions"), kind: "int" }, { key: "total", label: c.t("totalAmount"), kind: "money" }],
      rows: [...by.entries()].sort((a, b) => b[1].total - a[1].total).map(([category, v]) => ({ category, count: v.count, total: v.total })),
    },
  };
}

async function profitLoss(c: RunCtx): Promise<ReportResult> {
  const [{ data: pays }, ex] = await Promise.all([
    c.supabase.from("payments").select("amount_cents").gte("paid_on", c.from).lte("paid_on", c.to).limit(LIMIT * 4),
    expensesIn(c),
  ]);
  const income = sum(pays ?? [], (p) => n(p.amount_cents));
  const by = new Map<string, number>();
  for (const e of ex) by.set(e.category, (by.get(e.category) ?? 0) + e.amount_cents);
  const spent = sum(ex, (e) => e.amount_cents);
  const rows: Row[] = [
    { label: c.t("income"), amount: null, _bold: true },
    { label: c.t("paymentsCollected"), amount: income },
    { label: c.t("totalIncome"), amount: income, _bold: true },
    { label: c.t("expensesTitle"), amount: null, _bold: true },
    ...[...by.entries()].sort((a, b) => b[1] - a[1]).map(([label, amount]) => ({ label, amount })),
    { label: c.t("totalExpenses"), amount: spent, _bold: true },
    { label: c.t("netProfit"), amount: income - spent, _bold: true },
  ];
  return {
    tableTitle: c.t("statement"),
    stats: [stat(c.t("totalIncome"), income, "money", c.t("hintCollected"), "green"), stat(c.t("totalExpenses"), spent, "money", c.t("hintSpent"), "danger"), stat(c.t("netProfit"), income - spent, "money", c.t("hintNet"), income - spent < 0 ? "danger" : "accent")],
    cols: [{ key: "label", label: c.t("account"), kind: "text" }, { key: "amount", label: c.t("amount"), kind: "money" }],
    rows,
  };
}

async function salesTax(c: RunCtx): Promise<ReportResult> {
  const { data } = await c.supabase.rpc("report_sales_tax", { p_from: c.from, p_to: c.to });
  const rows = ((data ?? []) as { invoice_id: string; number: number; issue_date: string; customer_name: string; taxable_cents: number | string; tax_rate: number | string; tax_cents: number | string; total_cents: number | string }[]);
  const taxable = sum(rows, (r) => n(r.taxable_cents)), tax = sum(rows, (r) => n(r.tax_cents));
  return {
    tableTitle: c.t("taxList"),
    stats: [stat(c.t("invoices"), rows.length, "int", c.t("hintInvoices")), stat(c.t("taxableSales"), taxable, "money", c.t("hintTaxable"), "green"), stat(c.t("taxCollected"), tax, "money", c.t("hintTax"), "accent")],
    cols: [
      { key: "invoice", label: c.t("invoice"), kind: "text", link: true }, { key: "date", label: c.t("date"), kind: "date" }, { key: "customer", label: c.t("customer"), kind: "text" },
      { key: "taxable", label: c.t("taxable"), kind: "money" }, { key: "rate", label: c.t("rate"), kind: "pct" }, { key: "tax", label: c.t("tax"), kind: "money" }, { key: "total", label: c.t("total"), kind: "money" },
    ],
    rows: rows.map((r) => ({ invoice: quoteNumber(c.invoicePrefix, r.number), _href: `/invoices/${r.invoice_id}`, date: r.issue_date, customer: r.customer_name, taxable: n(r.taxable_cents), rate: n(r.tax_rate), tax: n(r.tax_cents), total: n(r.total_cents) })),
    totals: { invoice: c.t("totalRow"), taxable, tax, total: sum(rows, (r) => n(r.total_cents)) },
  };
}

const RUNNERS: Record<string, (c: RunCtx) => Promise<ReportResult>> = {
  invoice_details: invoiceDetails, item_sales: itemSales, revenue_by_client: revenueByClient, accounts_aging: accountsAging,
  payments_collected: paymentsCollected, profit_loss: profitLoss, sales_tax: salesTax, expense_report: expenseReport,
};

export const runReport = (key: string, c: RunCtx): Promise<ReportResult> | null => RUNNERS[key]?.(c) ?? null;
