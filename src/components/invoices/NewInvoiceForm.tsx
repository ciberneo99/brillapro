"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { createInvoice } from "@/modules/invoices/actions";
import { CustomerSearch, type CustomerOption } from "./CustomerSearch";

/** Step one: find the customer, then open the editor with their details filled in. */
export function NewInvoiceForm({ customers, initialId }: { customers: CustomerOption[]; initialId: string | null }) {
  const t = useTranslations("invoices");
  const [id, setId] = useState<string | null>(initialId && customers.some((c) => c.id === initialId) ? initialId : null);
  const selected = customers.find((c) => c.id === id) ?? null;
  return (
    <form action={createInvoice} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="customer_search" className="text-sm font-medium">{t("customer")}</label>
        <CustomerSearch id="customer_search" customers={customers} selectedId={id} onSelect={(c) => setId(c?.id ?? null)} autoFocus />
      </div>
      {selected && (
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <p className="font-semibold">{selected.name}</p>
          <p className="text-muted">{[selected.email, selected.phone, selected.address].filter(Boolean).join(" · ")}</p>
        </div>
      )}
      <input type="hidden" name="customer_id" value={id ?? ""} />
      <Button type="submit" disabled={!id}>{t("create")}</Button>
    </form>
  );
}
