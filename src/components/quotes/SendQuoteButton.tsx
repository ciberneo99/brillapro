"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { markQuoteSent } from "@/modules/quotes/actions";

/**
 * Manual send: marks the quote as sent, then opens the user's own email app with a prefilled message.
 * (The app never sends email itself in this phase; the PDF is downloaded and attached by the user.)
 */
export function SendQuoteButton({ id, mailto, resend }: { id: string; mailto: string; resend?: boolean }) {
  const t = useTranslations("quotes");
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const click = () =>
    start(async () => {
      if (!resend) {
        const r = await markQuoteSent(id);
        if (!r.ok) { setFailed(true); return; }
      }
      window.open(`/quotes/${id}/pdf`, "_blank", "noopener");
      window.location.href = mailto;
    });

  return (
    <div>
      <Button type="button" onClick={click} disabled={pending}>{resend ? t("emailAgain") : t("sendEmail")}</Button>
      {failed && <p className="mt-1 text-xs text-danger">{t("sendFailed")}</p>}
    </div>
  );
}
