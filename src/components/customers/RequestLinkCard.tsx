"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@/components/ui";
import { setAcceptsRequests } from "@/app/(app)/settings/requests";

export function RequestLinkCard({ url, enabled, canEdit }: { url: string; enabled: boolean; canEdit: boolean }) {
  const t = useTranslations("requests");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the link is selectable in the field below
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-base font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted">{t("body")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly value={url} aria-label={t("title")} onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 text-sm text-fg"
        />
        <Button type="button" variant="secondary" onClick={copy}>{copied ? t("copied") : t("copy")}</Button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className={enabled ? "text-sm text-success" : "text-sm text-warning"}>{enabled ? t("enabled") : t("disabled")}</p>
        {canEdit && (
          <form action={setAcceptsRequests.bind(null, !enabled)}>
            <Button type="submit" variant="ghost">{enabled ? t("turnOff") : t("turnOn")}</Button>
          </form>
        )}
      </div>
    </Card>
  );
}
