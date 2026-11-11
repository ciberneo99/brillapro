"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Field, Select } from "@/components/ui";
import { CustomerSearch, type CustomerOption } from "@/components/invoices/CustomerSearch";
import { createQuote } from "@/modules/quotes/actions";

/** Step one: find the customer (and pick a service), then open the editor. */
export function NewQuoteForm({ customers, services, initialId }: { customers: CustomerOption[]; services: { id: string; name: string }[]; initialId: string | null }) {
  const t = useTranslations("quotes");
  const [id, setId] = useState<string | null>(initialId && customers.some((c) => c.id === initialId) ? initialId : null);
  const selected = customers.find((c) => c.id === id) ?? null;
  return (
    <form action={createQuote} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="customer_search" className="text-sm font-medium">{t("customer")}</label>
        <CustomerSearch id="customer_search" customers={customers} selectedId={id} onSelect={(c) => setId(c?.id ?? null)} autoFocus />
      </div>
      {selected && (
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <p className="font-semibold">{selected.company ? `${selected.company} · ${selected.name}` : selected.name}</p>
          <p className="text-muted">{[selected.email, selected.phone, selected.address].filter(Boolean).join(" · ")}</p>
        </div>
      )}
      <input type="hidden" name="customer_id" value={id ?? ""} />
      <Field label={t("service")} htmlFor="service_type_id">
        <Select id="service_type_id" name="service_type_id" defaultValue="">
          <option value="">{t("noService")}</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="tiers" defaultChecked className="h-4 w-4" /> {t("startTiers")}
      </label>
      <Button type="submit" disabled={!id}>{t("create")}</Button>
    </form>
  );
}
