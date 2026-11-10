"use client";

import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, Button } from "@/components/ui";
import { scanReceipt } from "@/modules/expenses/actions";

/** Sets a React-controlled input/select from outside, so its own onChange formatting still runs. */
function setField(id: string, value: string) {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (el instanceof HTMLSelectElement) {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/** The receipt file field of the new-expense form, with an optional "read it with AI" helper that only pre-fills the form. */
export function ReceiptScanner({ aiEnabled }: { aiEnabled: boolean }) {
  const t = useTranslations("expenses");
  const input = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function scan() {
    const file = input.current?.files?.[0];
    if (!file) return;
    setReading(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.set("receipt", file);
      const res = await scanReceipt(body);
      if (!res.ok) {
        setMessage({ tone: "danger", text: t(res.error === "type" ? "receiptType" : res.error === "size" ? "receiptSize" : res.error === "disabled" ? "aiDisabled" : "aiFailed") });
        return;
      }
      const s = res.suggestion;
      if (s.vendor) setField("vendor", s.vendor);
      if (s.amount) setField("amount", s.amount);
      if (s.category_id) setField("category_id", s.category_id);
      if (s.date) window.dispatchEvent(new CustomEvent("bp:set-date", { detail: { name: "expense_date", value: s.date } }));
      const filled = [s.vendor, s.amount, s.date, s.category_id].filter(Boolean).length;
      setMessage(filled > 0 ? { tone: "success", text: t("aiFilled") } : { tone: "danger", text: t("aiNothing") });
    } catch {
      setMessage({ tone: "danger", text: t("aiFailed") });
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={input} id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => { setHasFile(Boolean(e.target.files?.length)); setMessage(null); }} className="block w-full text-sm"
      />
      {aiEnabled && hasFile && (
        <div className="space-y-1">
          <Button type="button" variant="secondary" onClick={scan} disabled={reading}>
            <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />{reading ? t("aiReading") : t("aiRead")}
          </Button>
          <p className="text-xs text-muted">{t("aiPrivacy")}</p>
        </div>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}
