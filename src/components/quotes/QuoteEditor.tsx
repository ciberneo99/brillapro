"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Input, Select, cn } from "@/components/ui";
import { DatePicker } from "@/components/ui/DatePicker";
import { BillToDetails } from "@/components/invoices/BillToDetails";
import { CustomerSearch, type CustomerOption } from "@/components/invoices/CustomerSearch";
import { SheetHeader, type SheetCompany } from "@/components/invoices/SheetHeader";
import { computeTotals, moveItem, textToCents, textToQty } from "@/lib/invoice-math";
import { formatMoney } from "@/lib/money";
import { formatMoneyFinal, formatMoneyTyping } from "@/lib/numbers";

export type EditorOption = { name: string; description: string; price: string };
export type EditorExtra = { description: string; quantity: string; price: string };
export type EditorQuote = {
  customerId: string | null; serviceId: string; title: string; issueDate: string; expiresOn: string; discount: string; taxRate: string;
  notes: string; terms: string; options: EditorOption[]; lines: EditorExtra[];
};

type OptRow = EditorOption & { key: number };
type LineRow = EditorExtra & { key: number };
const ta = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

/** Drag-to-reorder for a list: handle props for the grip, row props for the drop target. */
function useReorder(count: number, onMove: (from: number, to: number) => void) {
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return {
    from, over,
    handle: (i: number) => ({
      draggable: true as const,
      onDragStart: (e: React.DragEvent) => {
        setFrom(i); e.dataTransfer.effectAllowed = "move";
        const row = (e.currentTarget as HTMLElement).closest("li");
        if (row) e.dataTransfer.setDragImage(row, 16, 16);
      },
      onDragEnd: () => { setFrom(null); setOver(null); },
    }),
    row: (i: number) => ({
      onDragOver: (e: React.DragEvent) => { if (from !== null) { e.preventDefault(); setOver(i); } },
      onDrop: (e: React.DragEvent) => { e.preventDefault(); if (from !== null && i < count) onMove(from, i); setFrom(null); setOver(null); },
    }),
    rowClass: (i: number) => cn(from === i && "opacity-40", over === i && from !== null && from !== i && "bg-primary-soft"),
  };
}

function RowTools({ i, last, onMove, onRemove, t, removeLabel }: { i: number; last: boolean; onMove: (from: number, to: number) => void; onRemove: () => void; t: (k: string) => string; removeLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 md:flex-row md:justify-end">
      <button type="button" onClick={() => onMove(i, i - 1)} disabled={i === 0} aria-label={t("moveUp")} className="rounded p-1 text-muted hover:text-fg disabled:opacity-30"><ArrowUp className="h-4 w-4" aria-hidden /></button>
      <button type="button" onClick={() => onMove(i, i + 1)} disabled={last} aria-label={t("moveDown")} className="rounded p-1 text-muted hover:text-fg disabled:opacity-30 md:hidden"><ArrowDown className="h-4 w-4" aria-hidden /></button>
      <button type="button" onClick={onRemove} aria-label={removeLabel} className="rounded p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" aria-hidden /></button>
    </div>
  );
}

function Grip({ props, label }: { props: ReturnType<ReturnType<typeof useReorder>["handle"]>; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 pt-1">
      <span {...props} aria-hidden title={label} className="cursor-grab rounded p-1 text-muted hover:text-fg active:cursor-grabbing"><GripVertical className="h-4 w-4" /></span>
    </div>
  );
}

/** The quote as a document: same layout as the invoice, with Good/Better/Best options plus extra items charged on every option. */
export function QuoteEditor({
  number, company, customers, services, initial, currency, dateFormat, action, error, children,
}: {
  number: string; company: SheetCompany; customers: CustomerOption[]; services: { id: string; name: string }[]; initial: EditorQuote;
  currency: string; dateFormat: string; action: (formData: FormData) => void | Promise<void>; error?: boolean; children?: ReactNode;
}) {
  const t = useTranslations("quotes.editor");
  const counter = useRef(0); // keys for rows added later; read only in event handlers
  const nextKey = () => 1000 + counter.current++;
  const [options, setOptions] = useState<OptRow[]>(() => initial.options.map((o, i) => ({ ...o, key: i })));
  const [lines, setLines] = useState<LineRow[]>(() => initial.lines.map((l, i) => ({ ...l, key: i })));
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [discount, setDiscount] = useState(initial.discount);
  const [taxRate, setTaxRate] = useState(initial.taxRate);
  const [live, setLive] = useState("");
  const [pending, start] = useTransition();

  const m = (c: number) => formatMoney(c, currency);
  const customer = customers.find((c) => c.id === customerId) ?? null;
  const lineCents = (l: { quantity: string; price: string }) => Math.round(textToQty(l.quantity) * textToCents(l.price));
  const extraLines = lines.map((l) => ({ quantity: textToQty(l.quantity), unit_price_cents: textToCents(l.price) }));
  const totalFor = (base: number | null) =>
    computeTotals(base === null ? extraLines : [{ quantity: 1, unit_price_cents: base }, ...extraLines], textToCents(discount), Number(taxRate) || 0);

  const moveOpt = (from: number, to: number) => { if (to < 0 || to >= options.length) return; setOptions((r) => moveItem(r, from, to)); setLive(t("moved", { position: to + 1, total: options.length })); };
  const moveLine = (from: number, to: number) => { if (to < 0 || to >= lines.length) return; setLines((r) => moveItem(r, from, to)); setLive(t("moved", { position: to + 1, total: lines.length })); };
  const dragOpt = useReorder(options.length, moveOpt);
  const dragLine = useReorder(lines.length, moveLine);
  const setOpt = (key: number, patch: Partial<EditorOption>) => setOptions((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setLine = (key: number, patch: Partial<EditorExtra>) => setLines((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const summaries = options.length ? options.map((o) => ({ name: o.name.trim() || t("optionName"), x: totalFor(textToCents(o.price)), key: o.key })) : [{ name: "", x: totalFor(null), key: -1 }];

  return (
    <form id="quote-form" action={(fd) => start(() => action(fd))} className="space-y-0 rounded-xl border border-line bg-surface p-5 shadow-card sm:p-8">
      <SheetHeader company={company} alt={t("logoAlt")}>
        <div className="space-y-3">
          <p className="text-3xl font-bold tracking-tight text-primary">{t("quote")}</p>
          <p className="text-sm"><span className="inline-block rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">{t("draft")}</span> <span className="ml-1 font-semibold">{number}</span></p>
          <div className="grid gap-3 text-left">
            <div className="space-y-1"><label htmlFor="issue_date" className="text-xs font-medium text-muted">{t("date")}</label><DatePicker id="issue_date" name="issue_date" defaultValue={initial.issueDate} dateFormat={dateFormat} /></div>
            <div className="space-y-1"><label htmlFor="expires_on" className="text-xs font-medium text-muted">{t("validUntil")}</label><DatePicker id="expires_on" name="expires_on" defaultValue={initial.expiresOn} dateFormat={dateFormat} /></div>
          </div>
        </div>
      </SheetHeader>

      {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{t("error")}</p>}

      {/* Prepared for */}
      <section className="border-b border-line py-6" aria-labelledby="prepared-for">
        <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="space-y-2">
            <h2 id="prepared-for" className="text-base font-bold uppercase tracking-tight">{t("preparedFor")}</h2>
            <label htmlFor="customer_search" className="sr-only">{t("searchLabel")}</label>
            <CustomerSearch id="customer_search" customers={customers} selectedId={customerId} onSelect={(c) => setCustomerId(c?.id ?? null)} />
            <p className="text-xs text-muted">{t("customerHelp")}</p>
          </div>
          <BillToDetails name={customer?.name ?? ""} company={customer?.company} address={customer?.address ?? null} email={customer?.email ?? null} phone={customer?.phone ?? null} />
        </div>
        <input type="hidden" name="customer_id" value={customerId ?? ""} />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><label htmlFor="title" className="text-xs font-medium text-muted">{t("title")}</label>
            <Input id="title" name="title" defaultValue={initial.title} maxLength={120} placeholder={t("titlePlaceholder")} /></div>
          <div className="space-y-1"><label htmlFor="service_type_id" className="text-xs font-medium text-muted">{t("service")}</label>
            <Select id="service_type_id" name="service_type_id" defaultValue={initial.serviceId}>
              <option value="">{t("noService")}</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select></div>
        </div>
      </section>

      {/* Options */}
      <section className="border-b border-line py-6" aria-labelledby="options">
        <h2 id="options" className="text-base font-bold tracking-tight">{t("options")}</h2>
        <p className="mb-3 text-xs text-muted">{t("optionsHelp")}</p>
        {options.length > 0 && (
          <div className="hidden grid-cols-[2rem_minmax(0,12rem)_minmax(0,1fr)_8rem_7rem_4.5rem] gap-2 rounded-lg bg-primary px-2 py-2 text-xs font-semibold text-white md:grid">
            <span /><span>{t("optionName")}</span><span>{t("optionDescription")}</span><span className="text-right">{t("optionPrice")}</span><span className="text-right">{t("optionTotal")}</span><span />
          </div>
        )}
        <ul className="divide-y divide-line">
          {options.map((o, i) => (
            <li key={o.key} {...dragOpt.row(i)} className={cn("grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-start gap-2 py-3 md:grid-cols-[2rem_minmax(0,12rem)_minmax(0,1fr)_8rem_7rem_4.5rem] md:px-2", dragOpt.rowClass(i))}>
              <Grip props={dragOpt.handle(i)} label={t("drag")} />
              <div className="min-w-0 space-y-2 md:contents">
                <Input value={o.name} onChange={(e) => setOpt(o.key, { name: e.target.value })} maxLength={80} placeholder={t("optionName")} aria-label={`${t("optionName")} ${i + 1}`} />
                <Input value={o.description} onChange={(e) => setOpt(o.key, { description: e.target.value })} maxLength={1000} placeholder={t("optionDescription")} aria-label={`${t("optionDescription")} ${i + 1}`} />
                <Input value={o.price} onChange={(e) => setOpt(o.key, { price: formatMoneyTyping(e.target.value) })} onBlur={() => setOpt(o.key, { price: formatMoneyFinal(o.price) })} inputMode="decimal" className="md:text-right" placeholder="0.00" aria-label={`${t("optionPrice")} ${i + 1}`} />
                <p className="flex h-10 items-center justify-between text-sm font-semibold md:justify-end"><span className="text-xs font-normal text-muted md:hidden">{t("optionTotal")}</span>{m(totalFor(textToCents(o.price)).total)}</p>
              </div>
              <RowTools i={i} last={i === options.length - 1} onMove={moveOpt} onRemove={() => setOptions((rs) => rs.filter((x) => x.key !== o.key))} t={t} removeLabel={t("removeOption")} />
            </li>
          ))}
        </ul>
        {options.length === 0 && <p className="py-2 text-sm text-muted">{t("noOptions")}</p>}
        <Button type="button" variant="secondary" className="mt-3" onClick={() => setOptions((rs) => [...rs, { key: nextKey(), name: "", description: "", price: "" }])}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />{t("addOption")}
        </Button>
        <input type="hidden" name="options" value={JSON.stringify(options.map(({ name, description, price }) => ({ name, description, price })))} />
      </section>

      {/* Extra items */}
      <section className="py-6" aria-labelledby="extras">
        <h2 id="extras" className="text-base font-bold tracking-tight">{t("extras")}</h2>
        <p className="mb-3 text-xs text-muted">{t("extrasHelp")}</p>
        {lines.length > 0 && (
          <div className="hidden grid-cols-[2rem_minmax(0,1fr)_5rem_8rem_7rem_4.5rem] gap-2 rounded-lg bg-primary px-2 py-2 text-xs font-semibold text-white md:grid">
            <span /><span>{t("description")}</span><span className="text-right">{t("qty")}</span><span className="text-right">{t("rate")}</span><span className="text-right">{t("amount")}</span><span />
          </div>
        )}
        <ul className="divide-y divide-line">
          {lines.map((r, i) => (
            <li key={r.key} {...dragLine.row(i)} className={cn("grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-start gap-2 py-3 md:grid-cols-[2rem_minmax(0,1fr)_5rem_8rem_7rem_4.5rem] md:px-2", dragLine.rowClass(i))}>
              <Grip props={dragLine.handle(i)} label={t("drag")} />
              <div className="min-w-0 space-y-2 md:space-y-0">
                <Input value={r.description} onChange={(e) => setLine(r.key, { description: e.target.value })} maxLength={200} placeholder={t("descriptionPlaceholder")} aria-label={`${t("description")} ${i + 1}`} />
                <div className="grid grid-cols-3 gap-2 md:hidden">
                  <Input value={r.quantity} onChange={(e) => setLine(r.key, { quantity: e.target.value.replace(/[^\d.]/g, "").slice(0, 8) })} inputMode="decimal" aria-label={t("qty")} placeholder={t("qty")} />
                  <Input value={r.price} onChange={(e) => setLine(r.key, { price: formatMoneyTyping(e.target.value) })} onBlur={() => setLine(r.key, { price: formatMoneyFinal(r.price) })} inputMode="decimal" aria-label={t("rate")} placeholder={t("rate")} />
                  <p className="flex items-center justify-end text-sm font-medium">{m(lineCents(r))}</p>
                </div>
              </div>
              <Input className="hidden text-right md:block" value={r.quantity} onChange={(e) => setLine(r.key, { quantity: e.target.value.replace(/[^\d.]/g, "").slice(0, 8) })} inputMode="decimal" aria-label={`${t("qty")} ${i + 1}`} />
              <Input className="hidden text-right md:block" value={r.price} onChange={(e) => setLine(r.key, { price: formatMoneyTyping(e.target.value) })} onBlur={() => setLine(r.key, { price: formatMoneyFinal(r.price) })} inputMode="decimal" placeholder="0.00" aria-label={`${t("rate")} ${i + 1}`} />
              <p className="hidden h-10 items-center justify-end text-sm font-semibold md:flex">{m(lineCents(r))}</p>
              <RowTools i={i} last={i === lines.length - 1} onMove={moveLine} onRemove={() => setLines((rs) => rs.filter((x) => x.key !== r.key))} t={t} removeLabel={t("removeItem")} />
            </li>
          ))}
        </ul>
        <p className="sr-only" role="status" aria-live="polite">{live}</p>
        <Button type="button" variant="secondary" className="mt-3" onClick={() => setLines((rs) => [...rs, { key: nextKey(), description: "", quantity: "1", price: "" }])}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />{t("addItem")}
        </Button>
        <input type="hidden" name="lines" value={JSON.stringify(lines.map(({ description, quantity, price }) => ({ description, quantity, price })))} />
      </section>

      {/* Totals + notes */}
      <section className="grid gap-6 border-t border-line pt-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1"><label htmlFor="notes" className="text-sm font-semibold">{t("notes")}</label>
            <textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={initial.notes} placeholder={t("notesPlaceholder")} className={ta} /></div>
          <div className="space-y-1"><label htmlFor="terms" className="text-sm font-semibold">{t("terms")}</label>
            <textarea id="terms" name="terms" rows={4} maxLength={3000} defaultValue={initial.terms} className={ta} /></div>
        </div>
        <div className="space-y-3 text-sm md:ml-auto md:w-full md:max-w-xs">
          <div className="flex items-center justify-between gap-3"><label htmlFor="discount" className="text-muted">{t("discount")}</label>
            <div className="w-32"><Input id="discount" name="discount" value={discount} inputMode="decimal" className="text-right" placeholder="0.00"
              onChange={(e) => setDiscount(formatMoneyTyping(e.target.value))} onBlur={() => setDiscount((v) => formatMoneyFinal(v))} /></div></div>
          <div className="flex items-center justify-between gap-3"><label htmlFor="tax_rate" className="text-muted">{t("taxRate")}</label>
            <div className="w-32"><Input id="tax_rate" name="tax_rate" value={taxRate} inputMode="decimal" className="text-right" maxLength={6}
              onChange={(e) => setTaxRate(e.target.value.replace(/[^\d.]/g, ""))} /></div></div>
          {summaries.map(({ name, x, key }) => (
            <dl key={key} className="space-y-1 rounded-lg border border-line p-3" data-testid="quote-total-card">
              {name && <dt className="font-semibold">{name}</dt>}
              <div className="flex justify-between"><dt className="text-muted">{t("subtotal")}</dt><dd>{m(x.subtotal)}</dd></div>
              {x.discount > 0 && <div className="flex justify-between"><dt className="text-muted">{t("discount")}</dt><dd>−{m(x.discount)}</dd></div>}
              {Number(taxRate) > 0 && <div className="flex justify-between"><dt className="text-muted">{t("tax")} ({Number(taxRate)}%)</dt><dd>{m(x.tax)}</dd></div>}
              <div className="flex justify-between rounded-lg bg-primary px-3 py-2 text-base font-semibold text-white"><dt>{t("total")}</dt><dd>{m(x.total)}</dd></div>
            </dl>
          ))}
        </div>
      </section>

      <p className="pt-8 text-center text-sm font-semibold text-muted">{t("thanks")}</p>
      {children}

      <div className="flex justify-end gap-3 pt-6">
        <Button type="submit" disabled={pending}>{pending ? t("saving") : t("save")}</Button>
      </div>
    </form>
  );
}
