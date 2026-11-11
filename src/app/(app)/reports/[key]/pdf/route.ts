import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { getTranslations } from "next-intl/server";
import { todayIso } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { getAppContext } from "@/lib/session";
import { reportByKey } from "@/modules/reports/catalog";
import { buildRunCtx, periodLabel } from "@/modules/reports/context";
import { sortByDate } from "@/modules/reports/format";
import { ReportPdf } from "@/modules/reports/pdf";
import { parsePeriod } from "@/modules/reports/period";
import { PAYMENT_METHODS, runReport } from "@/modules/reports/run";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getAppContext();
  if (!ctx || !can(ctx.role, "reports:read")) return new Response("Not found", { status: 404 });
  const { key } = await params;
  const def = reportByKey(key);
  if (!def || !def.csv || def.unavailable || !def.needs.every((p) => can(ctx.role, p))) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const today = todayIso(ctx.settings.timezone);
  const period = parsePeriod({ range: q.get("range") ?? undefined, month: q.get("month") ?? undefined, year: q.get("year") ?? undefined, from: q.get("from") ?? undefined, to: q.get("to") ?? undefined }, today, "all");
  const method = key === "payments_collected" && PAYMENT_METHODS.includes(q.get("method") ?? "") ? q.get("method")! : undefined;
  const raw = await runReport(key, await buildRunCtx(ctx, period, method));
  if (!raw) return new Response("Not found", { status: 404 });
  const result = sortByDate(raw, "desc");

  const t = await getTranslations("reports");
  const locale = ctx.settings.doc_locale === "es" ? "es" : "en";
  const buffer = await renderToBuffer(
    createElement(ReportPdf, {
      company: ctx.tenant.name, title: t(`items.${key}.title`), periodLabel: def.ranged ? await periodLabel(ctx, period) : formatDateOnly(today, ctx.settings.date_format),
      generatedOn: formatDateOnly(today, ctx.settings.date_format), result, currency: ctx.settings.currency, dateFormat: ctx.settings.date_format,
      labels: {
        period: t("pdf.period"), generated: t("pdf.generated"), page: locale === "es" ? "Página" : "Page", of: locale === "es" ? "de" : "of",
        transactions: (n: number) => t("transactionsCount", { count: n }),
      },
    }) as Parameters<typeof renderToBuffer>[0],
  );
  const file = `${key}_${today}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${q.has("download") ? "attachment" : "inline"}; filename="${file}"`, "Cache-Control": "private, no-store" },
  });
}
