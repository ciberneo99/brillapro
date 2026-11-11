"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CreditCard, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";

/** Reloads the report's data (the server runs it again). */
export function RefreshButton({ className }: { className?: string }) {
  const t = useTranslations("reports");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" onClick={() => start(() => router.refresh())} disabled={pending} className={className}>
      <RefreshCw className={cn("mr-2 h-4 w-4", pending && "animate-spin")} aria-hidden />{t("refresh")}
    </button>
  );
}

type Props = {
  base: string;
  range: string;
  from: string;
  to: string;
  /** Show the payment method filter. */
  methods?: { id: string; label: string }[];
  method?: string;
  /** Hide the period filter (reports "as of today"). */
  noRange?: boolean;
};

const field = "relative flex items-center";
const select = "h-10 appearance-none rounded-lg border border-line bg-surface pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

/** Period and method pickers. Changing one reloads the report; "Custom range" reveals two dates. */
export function ReportFilters({ base, range, from, to, methods, method, noRange }: Props) {
  const t = useTranslations("reports");
  const form = useRef<HTMLFormElement>(null);
  const [custom, setCustom] = useState(range === "custom");
  const submit = () => form.current?.requestSubmit();
  return (
    <form ref={form} method="get" action={base} className="flex flex-wrap items-end gap-3">
      {!noRange && (
        <div className={field}>
          <Calendar className="pointer-events-none absolute left-3 h-4 w-4 text-muted" aria-hidden />
          <select
            name="range" defaultValue={range} aria-label={t("period")} className={select}
            onChange={(e) => { if (e.target.value === "custom") setCustom(true); else { setCustom(false); submit(); } }}
          >
            {(["all", "this_month", "last_month", "this_year", "last_year", "custom"] as const).map((r) => <option key={r} value={r}>{t(`range.${r}`)}</option>)}
          </select>
        </div>
      )}
      {methods && (
        <div className={field}>
          <CreditCard className="pointer-events-none absolute left-3 h-4 w-4 text-muted" aria-hidden />
          <select name="method" defaultValue={method ?? ""} aria-label={t("methodFilter")} className={select} onChange={submit}>
            <option value="">{t("allMethods")}</option>
            {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      )}
      {!noRange && custom && (
        <>
          <label className="space-y-1 text-xs text-muted">{t("from")}<input type="date" name="from" required defaultValue={from.startsWith("2000") ? "" : from} className="block h-10 rounded-lg border border-line bg-surface px-3 text-sm text-fg" /></label>
          <label className="space-y-1 text-xs text-muted">{t("to")}<input type="date" name="to" required defaultValue={to.startsWith("2100") ? "" : to} className="block h-10 rounded-lg border border-line bg-surface px-3 text-sm text-fg" /></label>
          <button type="submit" className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">{t("applyRange")}</button>
        </>
      )}
    </form>
  );
}
