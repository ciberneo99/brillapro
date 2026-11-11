import "server-only";
import { quoteNumber } from "@/lib/money";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type Kind = "text" | "date" | "money" | "int" | "pct";
export type Col = { key: string; label: string; kind: Kind };
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell> & { _bold?: boolean };
export type ReportResult = {
  cols: Col[];
  rows: Row[];
  /** Grand totals row, shown at the bottom. */
  totals?: Row;
  /** Small figures above the table (for example payments by method). */
  summary?: { label: string; cents: number }[];
};

export type RunCtx = {
  supabase: Supabase;
  from: string;
  to: string;
  today: string;
  invoicePrefix: string;
  /** Translates a column or label key from `reports.cols`. */
  t: (key: string) => string;
  /** Translates a payment method id. */
  method: (m: string) => string;
  status: (s: string) => string;
};

const LIMIT = 5000;
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const n = (v: unknown) => Number(v ?? 0);

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

async function invoiceDetails(c: RunCtx): Promise<ReportResult> {
  const inv = await invoicesIn(c);
  const ok = live(inv);
  return {
    cols: [
      { key: "number", label: c.t("invoice"), kind: "text" }, { key: "date", label: c.t("date"), kind: "date" }, { key: "due", label: c.t("due"), kind: "date" },
      { key: "customer", label: c.t("customer"), kind: "text" }, { key: "status", label: c.t("status"), kind: "text" },
      { key: "total", label: c.t("total"), kind: "money" }, { key: "paid", label: c.t("paid"), kind: "money" }, { key: "balance", label: c.t("balance"), kind: "money" },
    ],
    rows: inv.map((r) => ({
      number: quoteNumber(c.invoicePrefix, r.number), date: r.issue_date, due: r.due_date, customer: r.customer_name, status: c.status(r.display_status),
      total: r.total_cents, paid: r.paid_cents, balance: r.status === "void" ? 0 : r.balance_cents,
    })),
    totals: { number: c.t("totalRow"), total: sum(ok, (r) => r.total_cents), paid: sum(ok, (r) => r.paid_cents), balance: sum(ok, (r) => r.balance_cents) },
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
  return {
    cols: [
      { key: "item", label: c.t("item"), kind: "text" }, { key: "invoices", label: c.t("invoices"), kind: "int" },
      { key: "qty", label: c.t("qty"), kind: "int" }, { key: "revenue", label: c.t("revenue"), kind: "money" },
    ],
    rows: rows.map((r) => ({ item: r.name, invoices: r.invoices.size, qty: Math.round(r.qty * 100) / 100, revenue: r.revenue })),
    totals: { item: c.t("totalRow"), revenue: sum(rows, (r) => r.revenue) },
  };
}

async function revenueByClient(c: RunCtx): Promise<ReportResult> {
  const by = new Map<string, { name: string; count: number; total: number; paid: number }>();
  for (const r of live(await invoicesIn(c))) {
    const x = by.get(r.customer_id) ?? { name: r.customer_name, count: 0, total: 0, paid: 0 };
    x.count++; x.total += r.total_cents; x.paid += r.paid_cents;
    by.set(r.customer_id, x);
  }
  const rows = [...by.values()].sort((a, b) => b.total - a.total);
  const grand = sum(rows, (r) => r.total);
  return {
    cols: [
      { key: "customer", label: c.t("customer"), kind: "text" }, { key: "invoices", label: c.t("invoices"), kind: "int" },
      { key: "invoiced", label: c.t("invoiced"), kind: "money" }, { key: "paid", label: c.t("paid"), kind: "money" },
      { key: "balance", label: c.t("balance"), kind: "money" }, { key: "share", label: c.t("share"), kind: "pct" },
    ],
    rows: rows.map((r) => ({ customer: r.name, invoices: r.count, invoiced: r.total, paid: r.paid, balance: r.total - r.paid, share: grand ? Math.round((r.total / grand) * 1000) / 10 : 0 })),
    totals: { customer: c.t("totalRow"), invoices: sum(rows, (r) => r.count), invoiced: grand, paid: sum(rows, (r) => r.paid), balance: grand - sum(rows, (r) => r.paid) },
  };
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

async function accountsAging(c: RunCtx): Promise<ReportResult> {
  const { data } = await c.supabase
    .from("invoices_overview").select("customer_id,customer_name,due_date,balance_cents")
    .eq("status", "sent").gt("balance_cents", 0).limit(LIMIT);
  const by = new Map<string, { name: string; b: number[] }>();
  for (const r of data ?? []) {
    const late = daysBetween(r.due_date, c.today);
    const bucket = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    const x = by.get(r.customer_id) ?? { name: r.customer_name, b: [0, 0, 0, 0, 0] };
    x.b[bucket] += n(r.balance_cents);
    by.set(r.customer_id, x);
  }
  const rows = [...by.values()].map((x) => ({ ...x, total: sum(x.b, (v) => v) })).sort((a, b) => b.total - a.total);
  const col = (i: number) => sum(rows, (r) => r.b[i]);
  return {
    cols: [
      { key: "customer", label: c.t("customer"), kind: "text" }, { key: "current", label: c.t("notDue"), kind: "money" },
      { key: "d30", label: "1–30", kind: "money" }, { key: "d60", label: "31–60", kind: "money" }, { key: "d90", label: "61–90", kind: "money" },
      { key: "d90p", label: "90+", kind: "money" }, { key: "total", label: c.t("total"), kind: "money" },
    ],
    rows: rows.map((r) => ({ customer: r.name, current: r.b[0], d30: r.b[1], d60: r.b[2], d90: r.b[3], d90p: r.b[4], total: r.total })),
    totals: { customer: c.t("totalRow"), current: col(0), d30: col(1), d60: col(2), d90: col(3), d90p: col(4), total: sum(rows, (r) => r.total) },
  };
}

async function paymentsCollected(c: RunCtx): Promise<ReportResult> {
  const { data } = await c.supabase
    .from("payments").select("invoice_id,amount_cents,paid_on,method,reference").gte("paid_on", c.from).lte("paid_on", c.to).order("paid_on").limit(LIMIT);
  const pays = data ?? [];
  const ids = [...new Set(pays.map((p) => p.invoice_id))];
  const info = new Map<string, { number: number; customer: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: inv } = await c.supabase.from("invoices_overview").select("id,number,customer_name").in("id", ids.slice(i, i + 200));
    for (const r of inv ?? []) info.set(r.id, { number: r.number, customer: r.customer_name });
  }
  const methods = new Map<string, number>();
  for (const p of pays) methods.set(p.method, (methods.get(p.method) ?? 0) + n(p.amount_cents));
  return {
    cols: [
      { key: "date", label: c.t("date"), kind: "date" }, { key: "invoice", label: c.t("invoice"), kind: "text" }, { key: "customer", label: c.t("customer"), kind: "text" },
      { key: "method", label: c.t("method"), kind: "text" }, { key: "reference", label: c.t("reference"), kind: "text" }, { key: "amount", label: c.t("amount"), kind: "money" },
    ],
    rows: pays.map((p) => ({
      date: p.paid_on, invoice: info.has(p.invoice_id) ? quoteNumber(c.invoicePrefix, info.get(p.invoice_id)!.number) : "", customer: info.get(p.invoice_id)?.customer ?? "",
      method: c.method(p.method), reference: p.reference ?? "", amount: n(p.amount_cents),
    })),
    totals: { date: c.t("totalRow"), amount: sum(pays, (p) => n(p.amount_cents)) },
    summary: [...methods.entries()].sort((a, b) => b[1] - a[1]).map(([m, cents]) => ({ label: c.method(m), cents })),
  };
}

async function expensesIn(c: RunCtx) {
  const [{ data: ex }, { data: cats }] = await Promise.all([
    c.supabase.from("expenses").select("expense_date,vendor,description,amount_cents,payment_method,category_id").gte("expense_date", c.from).lte("expense_date", c.to).order("expense_date").limit(LIMIT),
    c.supabase.from("expense_categories").select("id,name"),
  ]);
  const names = new Map((cats ?? []).map((k) => [k.id, k.name as string]));
  return (ex ?? []).map((e) => ({ ...e, amount_cents: n(e.amount_cents), category: names.get(e.category_id) ?? "" }));
}

async function expenseReport(c: RunCtx): Promise<ReportResult> {
  const ex = await expensesIn(c);
  const by = new Map<string, number>();
  for (const e of ex) by.set(e.category, (by.get(e.category) ?? 0) + e.amount_cents);
  return {
    cols: [
      { key: "date", label: c.t("date"), kind: "date" }, { key: "category", label: c.t("category"), kind: "text" }, { key: "vendor", label: c.t("vendor"), kind: "text" },
      { key: "description", label: c.t("description"), kind: "text" }, { key: "method", label: c.t("method"), kind: "text" }, { key: "amount", label: c.t("amount"), kind: "money" },
    ],
    rows: ex.map((e) => ({ date: e.expense_date, category: e.category, vendor: e.vendor, description: e.description ?? "", method: e.payment_method ? c.method(e.payment_method) : "", amount: e.amount_cents })),
    totals: { date: c.t("totalRow"), amount: sum(ex, (e) => e.amount_cents) },
    summary: [...by.entries()].sort((a, b) => b[1] - a[1]).map(([label, cents]) => ({ label, cents })),
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
  return { cols: [{ key: "label", label: c.t("account"), kind: "text" }, { key: "amount", label: c.t("amount"), kind: "money" }], rows };
}

async function salesTax(c: RunCtx): Promise<ReportResult> {
  const { data } = await c.supabase.rpc("report_sales_tax", { p_from: c.from, p_to: c.to });
  const rows = ((data ?? []) as { number: number; issue_date: string; customer_name: string; taxable_cents: number | string; tax_rate: number | string; tax_cents: number | string; total_cents: number | string }[]);
  return {
    cols: [
      { key: "invoice", label: c.t("invoice"), kind: "text" }, { key: "date", label: c.t("date"), kind: "date" }, { key: "customer", label: c.t("customer"), kind: "text" },
      { key: "taxable", label: c.t("taxable"), kind: "money" }, { key: "rate", label: c.t("rate"), kind: "pct" }, { key: "tax", label: c.t("tax"), kind: "money" }, { key: "total", label: c.t("total"), kind: "money" },
    ],
    rows: rows.map((r) => ({ invoice: quoteNumber(c.invoicePrefix, r.number), date: r.issue_date, customer: r.customer_name, taxable: n(r.taxable_cents), rate: n(r.tax_rate), tax: n(r.tax_cents), total: n(r.total_cents) })),
    totals: { invoice: c.t("totalRow"), taxable: sum(rows, (r) => n(r.taxable_cents)), tax: sum(rows, (r) => n(r.tax_cents)), total: sum(rows, (r) => n(r.total_cents)) },
  };
}

const RUNNERS: Record<string, (c: RunCtx) => Promise<ReportResult>> = {
  invoice_details: invoiceDetails, item_sales: itemSales, revenue_by_client: revenueByClient, accounts_aging: accountsAging,
  payments_collected: paymentsCollected, profit_loss: profitLoss, sales_tax: salesTax, expense_report: expenseReport,
};

export const runReport = (key: string, c: RunCtx): Promise<ReportResult> | null => RUNNERS[key]?.(c) ?? null;
