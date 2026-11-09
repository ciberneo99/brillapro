"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { markInvoiceSent } from "@/modules/invoices/actions";

/** Manual send: issues a draft, then opens the PDF and the user's own email app with a prefilled message. */
export function SendInvoiceButton({ id, mailto, resend }: { id: string; mailto: string; resend?: boolean }) {
  const t = useTranslations("invoices");
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const click = () =>
    start(async () => {
      if (!resend) {
        const r = await markInvoiceSent(id);
        if (!r.ok) { setFailed(true); return; }
      }
      window.open(`/invoices/${id}/pdf`, "_blank", "noopener");
      window.location.href = mailto;
    });

  return (
    <div>
      <Button type="button" onClick={click} disabled={pending}>{resend ? t("emailAgain") : t("sendEmail")}</Button>
      {failed && <p className="mt-1 text-xs text-danger">{t("sendFailed")}</p>}
    </div>
  );
}
