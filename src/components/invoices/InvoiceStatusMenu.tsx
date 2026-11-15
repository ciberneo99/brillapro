"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { setInvoiceStatus } from "@/modules/invoices/actions";

/** Drop-down to set the invoice's status by hand: Draft, Sent / Unpaid (opens Add payment) or Cancelled. */
export function InvoiceStatusMenu({ id, status }: { id: string; status: string }) {
  const t = useTranslations("invoices.toolbar");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(next: string) {
    if (next === status) return;
    if (next === "void" && !window.confirm(t("confirmVoid"))) return;
    setError(null);
    start(async () => {
      const r = await setInvoiceStatus(id, next);
      if (!r.ok) setError(t(r.reason === "payments" ? "statusHasPayments" : r.reason === "lines" ? "statusNoLines" : r.reason === "missing" ? "statusMissing" : "statusFailed"));
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <div className="w-44">
        <SelectMenu
          ariaLabel={t("statusLabel")} value={status} disabled={pending} onChange={change}
          options={[{ value: "draft", label: t("statusDraft") }, { value: "sent", label: t("statusSent") }, { value: "void", label: t("statusVoid") }]}
        />
      </div>
      {error && <p role="alert" className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger shadow-lg">{error}</p>}
    </div>
  );
}
