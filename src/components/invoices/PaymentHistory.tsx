"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { centsToMoneyText, formatMoney } from "@/lib/money";
import { deletePayment, updatePayment } from "@/modules/invoices/actions";
import { PaymentFields } from "./PaymentFields";

export type PaymentRow = { id: string; amount_cents: number; paid_on: string; paid_label: string; method: string; reference: string | null; notes: string | null };

/** Payments on the invoice. Owners and admins can edit or delete a payment. */
export function PaymentHistory({ invoiceId, payments, canManage, currency, dateFormat }: { invoiceId: string; payments: PaymentRow[]; canManage: boolean; currency: string; dateFormat: string }) {
  const t = useTranslations("invoices");
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="border-t border-line pt-6" aria-labelledby="pay-history">
      <h2 id="pay-history" className="text-sm font-semibold">{t("toolbar.paymentHistory")}</h2>
      <ul className="mt-3 divide-y divide-line rounded-lg bg-surface-2 text-sm">
        {payments.map((p) => (
          <li key={p.id} className="px-4 py-3">
            {editing === p.id ? (
              <form action={updatePayment.bind(null, invoiceId, p.id)} className="space-y-3">
                <PaymentFields idp={`edit-${p.id}`} currency={currency} dateFormat={dateFormat}
                  v={{ amount: centsToMoneyText(p.amount_cents), paid_on: p.paid_on, method: p.method, reference: p.reference ?? "", notes: p.notes ?? "" }} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEditing(null)}>{t("toolbar.cancel")}</Button>
                  <Button type="submit">{t("save")}</Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{formatMoney(p.amount_cents, currency)} <span className="font-normal text-muted">· {t(`method.${p.method}`)}</span></p>
                  <p className="text-xs text-muted">{p.paid_label}{p.reference ? ` · ${p.reference}` : ""}{p.notes ? ` · ${p.notes}` : ""}</p>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setEditing(p.id)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-surface"><Pencil className="h-3.5 w-3.5" aria-hidden />{t("toolbar.edit")}</button>
                    <form action={deletePayment.bind(null, invoiceId, p.id)} onSubmit={(e) => { if (!window.confirm(t("toolbar.confirmDeletePayment"))) e.preventDefault(); }}>
                      <button type="submit" className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-danger hover:bg-surface"><Trash2 className="h-3.5 w-3.5" aria-hidden />{t("remove")}</button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
