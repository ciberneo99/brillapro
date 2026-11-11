"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Input, cn } from "@/components/ui";
import { DatePicker } from "@/components/ui/DatePicker";
import { computeTotals, moveItem, textToCents, textToQty } from "@/lib/invoice-math";
import { formatMoney } from "@/lib/money";
import { formatMoneyFinal, formatMoneyTyping } from "@/lib/numbers";
import { CustomerSearch, type CustomerOption } from "./CustomerSearch";
import { BillToDetails } from "./BillToDetails";
import { SheetHeader, type SheetCompany } from "./SheetHeader";

export type EditorLine = { description: string; quantity: string; price: string };
export type EditorInvoice = {
  customerId: string | null; customerName: string; customerEmail: string; customerPhone: string; billingAddress: string;
  issueDate: string; dueDate: string; discount: string; taxRate: string; notes: string; terms: string; lines: EditorLine[];
};

type Row = EditorLine & { key: number };
const ta = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

/** The invoice as a document: header in three columns, customer search, drag-to-reorder items, live totals. One Save writes everything. */
export function InvoiceEditor({
  number, company, customers, initial, currency, dateFormat, action, error,
}: {
  number: string; company: SheetCompany; customers: CustomerOption[]; initial: EditorInvoice; currency: string; dateFormat: string;
  action: (formData: FormData) => void | Promise<void>; error?: boolean;
}) {
  const t = useTranslations("invoices.editor");
  const initialRows = initial.lines.length ? initial.lines : [{ description: "", quantity: "1", price: "" }];
  const counter = useRef(initialRows.length); // keys for rows added later; read only in event handlers
  const nextKey = () => counter.current++;
  const [rows, setRows] = useState<Row[]>(() => initialRows.map((l, i) => ({ ...l, key: i })));
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [name, setName] = useState(initial.customerName);
  const [email, setEmail] = useState(initial.customerEmail);
  const [address, setAddress] = useState(initial.billingAddress);
  const [editing, setEditing] = useState(!initial.customerName.trim());
  const [discount, setDiscount] = useState(initial.discount);
  const [taxRate, setTaxRate] = useState(initial.taxRate);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [live, setLive] = useState("");
  const [pending, start] = useTransition();

  const m = (c: number) => formatMoney(c, currency);
  const totals = computeTotals(
    rows.map((r) => ({ quantity: textToQty(r.quantity), unit_price_cents: textToCents(r.price) })),
    textToCents(discount), Number(taxRate) || 0,
  );

  const update = (key: number, patch: Partial<EditorLine>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return;
    setRows((rs) => moveItem(rs, from, to));
    setLive(t("moved", { position: to + 1, total: rows.length }));
  };
  const pick = (c: CustomerOption | null) => {
    if (!c) { setCustomerId(null); return; }
    setCustomerId(c.id);
    setName(c.name);
    setEmail(c.email ?? "");
    setAddress(c.address ?? "");
  };

  const payload = JSON.stringify(rows.map(({ description, quantity, price }) => ({ description, quantity, price })));

  return (
    <form id="invoice-form" action={(fd) => start(() => action(fd))} className="space-y-0 rounded-xl border border-line bg-surface p-5 shadow-card sm:p-8">
      <SheetHeader company={company} alt={t("logoAlt")}>
        <div className="space-y-3">
          <p className="text-3xl font-bold tracking-tight text-primary">{t("invoice")}</p>
          <p className="text-sm"><span className="inline-block rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">{t("draft")}</span> <span className="ml-1 font-semibold">{number}</span></p>
          <div className="grid gap-3 text-left">
            <div className="space-y-1"><label htmlFor="issue_date" className="text-xs font-medium text-muted">{t("date")}</label><DatePicker id="issue_date" name="issue_date" defaultValue={initial.issueDate} dateFormat={dateFormat} /></div>
            <div className="space-y-1"><label htmlFor="due_date" className="text-xs font-medium text-muted">{t("dueDate")}</label><DatePicker id="due_date" name="due_date" defaultValue={initial.dueDate} dateFormat={dateFormat} /></div>
          </div>
        </div>
      </SheetHeader>

      {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{t("error")}</p>}

      {/* Bill to */}
      <section className="border-b border-line py-6" aria-labelledby="bill-to">
        <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="space-y-2">
            <h2 id="bill-to" className="text-base font-bold uppercase tracking-tight">{t("billTo")}</h2>
            <label htmlFor="customer_search" className="sr-only">{t("searchLabel")}</label>
            <CustomerSearch id="customer_search" customers={customers} selectedId={customerId} onSelect={pick} />
            <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} className="text-xs text-primary hover:underline">{editing ? t("hideDetails") : t("editDetails")}</button>
          </div>
          <BillToDetails name={name} address={address} email={email} phone={customers.find((c) => c.id === customerId)?.phone ?? initial.customerPhone} />
        </div>
        <div hidden={!editing} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><label htmlFor="customer_name" className="text-xs font-medium text-muted">{t("customerName")}</label>
            <Input id="customer_name" name="customer_name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={160} /></div>
          <div className="space-y-1"><label htmlFor="customer_email" className="text-xs font-medium text-muted">{t("customerEmail")}</label>
            <Input id="customer_email" name="customer_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} /></div>
          <div className="space-y-1 sm:col-span-2"><label htmlFor="billing_address" className="text-xs font-medium text-muted">{t("customerAddress")}</label>
            <Input id="billing_address" name="billing_address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} /></div>
        </div>
        <input type="hidden" name="customer_id" value={customerId ?? ""} />
      </section>

      {/* Items */}
      <section className="py-6" aria-labelledby="items">
        <h2 id="items" className="sr-only">{t("items")}</h2>
        <div className="hidden grid-cols-[2rem_minmax(0,1fr)_5rem_8rem_7rem_4.5rem] gap-2 rounded-lg bg-primary px-2 py-2 text-xs font-semibold text-white md:grid">
          <span /><span>{t("description")}</span><span className="text-right">{t("qty")}</span><span className="text-right">{t("rate")}</span><span className="text-right">{t("amount")}</span><span />
        </div>
        <ul className="divide-y divide-line">
          {rows.map((r, i) => (
            <li
              key={r.key}
              onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDragOver(i); } }}
              onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) move(dragFrom, i); setDragFrom(null); setDragOver(null); }}
              className={cn("grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-start gap-2 py-3 md:grid-cols-[2rem_minmax(0,1fr)_5rem_8rem_7rem_4.5rem] md:px-2",
                dragFrom === i && "opacity-40", dragOver === i && dragFrom !== null && dragFrom !== i && "bg-primary-soft")}
            >
              <div className="flex flex-col items-center gap-0.5 pt-1">
                <span
                  draggable aria-hidden title={t("drag")}
                  onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = "move"; const row = (e.currentTarget as HTMLElement).closest("li"); if (row) e.dataTransfer.setDragImage(row, 16, 16); }}
                  onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                  className="cursor-grab rounded p-1 text-muted hover:text-fg active:cursor-grabbing"
                ><GripVertical className="h-4 w-4" /></span>
              </div>
              <div className="min-w-0 space-y-2 md:space-y-0">
                <Input value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} maxLength={200} placeholder={t("descriptionPlaceholder")} aria-label={`${t("description")} ${i + 1}`} />
                <div className="grid grid-cols-3 gap-2 md:hidden">
                  <Input value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value.replace(/[^\d.]/g, "").slice(0, 8) })} inputMode="decimal" aria-label={t("qty")} placeholder={t("qty")} />
                  <Input value={r.price} onChange={(e) => update(r.key, { price: formatMoneyTyping(e.target.value) })} onBlur={() => update(r.key, { price: formatMoneyFinal(r.price) })} inputMode="decimal" aria-label={t("rate")} placeholder={t("rate")} />
                  <p className="flex items-center justify-end text-sm font-medium">{m(Math.round(textToQty(r.quantity) * textToCents(r.price)))}</p>
                </div>
              </div>
              <Input className="hidden text-right md:block" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value.replace(/[^\d.]/g, "").slice(0, 8) })} inputMode="decimal" aria-label={`${t("qty")} ${i + 1}`} />
              <Input className="hidden text-right md:block" value={r.price} onChange={(e) => update(r.key, { price: formatMoneyTyping(e.target.value) })} onBlur={() => update(r.key, { price: formatMoneyFinal(r.price) })} inputMode="decimal" placeholder="0.00" aria-label={`${t("rate")} ${i + 1}`} />
              <p className="hidden h-10 items-center justify-end text-sm font-semibold md:flex">{m(Math.round(textToQty(r.quantity) * textToCents(r.price)))}</p>
              <div className="flex flex-col items-center gap-0.5 md:flex-row md:justify-end">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={t("moveUp")} className="rounded p-1 text-muted hover:text-fg disabled:opacity-30"><ArrowUp className="h-4 w-4" aria-hidden /></button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === rows.length - 1} aria-label={t("moveDown")} className="rounded p-1 text-muted hover:text-fg disabled:opacity-30 md:hidden"><ArrowDown className="h-4 w-4" aria-hidden /></button>
                <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={t("removeItem")} className="rounded p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" aria-hidden /></button>
              </div>
            </li>
          ))}
        </ul>
        <p className="sr-only" role="status" aria-live="polite">{live}</p>
        <Button type="button" variant="secondary" className="mt-3" onClick={() => setRows((rs) => [...rs, { key: nextKey(), description: "", quantity: "1", price: "" }])}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />{t("addItem")}
        </Button>
        {rows.length > 1 && <p className="mt-2 text-xs text-muted">{t("dragHelp")}</p>}
        <input type="hidden" name="lines" value={payload} />
      </section>

      {/* Totals + notes */}
      <section className="grid gap-6 border-t border-line pt-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1"><label htmlFor="notes" className="text-sm font-semibold">{t("notes")}</label>
            <textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={initial.notes} placeholder={t("notesPlaceholder")} className={ta} /></div>
          <div className="space-y-1"><label htmlFor="terms" className="text-sm font-semibold">{t("terms")}</label>
            <textarea id="terms" name="terms" rows={4} maxLength={3000} defaultValue={initial.terms} className={ta} /></div>
        </div>
        <dl className="space-y-2 text-sm md:ml-auto md:w-full md:max-w-xs">
          <div className="flex justify-between"><dt className="text-muted">{t("subtotal")}</dt><dd>{m(totals.subtotal)}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt><label htmlFor="discount" className="text-muted">{t("discount")}</label></dt>
            <dd className="w-32"><Input id="discount" name="discount" value={discount} inputMode="decimal" className="text-right" placeholder="0.00"
              onChange={(e) => setDiscount(formatMoneyTyping(e.target.value))} onBlur={() => setDiscount((v) => formatMoneyFinal(v))} /></dd></div>
          <div className="flex items-center justify-between gap-3"><dt><label htmlFor="tax_rate" className="text-muted">{t("taxRate")}</label></dt>
            <dd className="w-32"><Input id="tax_rate" name="tax_rate" value={taxRate} inputMode="decimal" className="text-right" maxLength={6}
              onChange={(e) => setTaxRate(e.target.value.replace(/[^\d.]/g, ""))} /></dd></div>
          {totals.discount > 0 && <div className="flex justify-between"><dt className="text-muted">{t("discount")}</dt><dd>−{m(totals.discount)}</dd></div>}
          {Number(taxRate) > 0 && <div className="flex justify-between"><dt className="text-muted">{t("tax")} ({Number(taxRate)}%)</dt><dd>{m(totals.tax)}</dd></div>}
          <div className="flex justify-between rounded-lg bg-primary px-3 py-2 text-base font-semibold text-white"><dt>{t("total")}</dt><dd>{m(totals.total)}</dd></div>
        </dl>
      </section>

      <p className="pt-8 text-center text-sm font-semibold text-muted">{t("thanks")}</p>

      <div className="flex justify-end gap-3 pt-6">
        <Button type="submit" disabled={pending}>{pending ? t("saving") : t("save")}</Button>
      </div>
    </form>
  );
}
