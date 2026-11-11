import "server-only";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/calendar";
import type { AppContext } from "@/lib/session";
import { getInvoiceSettings } from "@/modules/invoices/queries";
import type { Period } from "./period";
import type { RunCtx } from "./run";

/** Everything a report needs to run, with labels in the person's language. */
export async function buildRunCtx(ctx: AppContext, p: Period): Promise<RunCtx> {
  const [t, ti, supabase, is] = await Promise.all([
    getTranslations("reports.cols"), getTranslations("invoices"), createClient(), getInvoiceSettings(ctx.tenant.id),
  ]);
  return {
    supabase, from: p.from, to: p.to, today: todayIso(ctx.settings.timezone), invoicePrefix: is.invoice_prefix,
    t: (k) => t(k), method: (m) => ti(`method.${m}`), status: (s) => ti(`status.${s}`),
  };
}
