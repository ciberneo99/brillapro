"use client";

import { useState } from "react";
import { CustomerSearch, type CustomerOption } from "@/components/invoices/CustomerSearch";

/** Customer picker with type-ahead search (name, phone, email, address). Submits `customer_id`; the form will not send without one. */
export function JobCustomerField({ customers, initialId, id = "customer_id" }: { customers: CustomerOption[]; initialId?: string | null; id?: string }) {
  const [selected, setSelected] = useState<string | null>(customers.some((c) => c.id === initialId) ? (initialId ?? null) : null);
  return (
    <div className="relative">
      <CustomerSearch id={id} customers={customers} selectedId={selected} onSelect={(c) => setSelected(c?.id ?? null)} autoFocus={!initialId} />
      <input type="hidden" name="customer_id" value={selected ?? ""} />
      <input required value={selected ?? ""} onChange={() => {}} tabIndex={-1} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0" />
    </div>
  );
}
