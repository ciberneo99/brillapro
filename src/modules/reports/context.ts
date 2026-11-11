import "server-only";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/calendar";
import type { AppContext } from "@/lib/session";
import { getInvoiceSettings } from "@/modules/invoices/queries";
import type { Period } from "./period";
import type { RunCtx } from "./run";

/** Everything a report needs to run, with labels in the person's language. */
export async function buildRunCtx(ctx: AppContext, p: Period, method?: string): Promise<RunCtx> {
  const [t, ti, supabase, is] = await Promise.all([
    getTranslations("reports.cols"), getTranslations("invoices"), createClient(), getInvoiceSettings(ctx.tenant.id),
  ]);
  return {
    supabase, from: p.from, to: p.to, today: todayIso(ctx.settings.timezone), invoicePrefix: is.invoice_prefix, method,
    t: (k) => t(k), methodName: (m) => ti(`method.${m}`), status: (s) => ti(`status.${s}`),
  };
}

/** The period as the person reads it: "All time", "November 2026", "2026" or "01/01/2026 – 03/31/2026". */
export async function periodLabel(ctx: AppContext, p: Period): Promise<string> {
  const t = await getTranslations("reports.range");
  const locale = ctx.settings.doc_locale === "es" ? "es-US" : "en-US";
  const { formatDateOnly } = await import("@/lib/dates");
  if (p.mode === "all") return t("all");
  if (p.mode === "year") return String(p.year);
  if (p.mode === "month") return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${p.month}-01T00:00:00Z`));
  return `${formatDateOnly(p.from, ctx.settings.date_format)} – ${formatDateOnly(p.to, ctx.settings.date_format)}`;
}
