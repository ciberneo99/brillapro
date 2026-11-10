import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { can } from "@/lib/permissions";
import { getAppContext } from "@/lib/session";
import { VenmoPdf } from "@/modules/venmo/pdf";
import { reportFromForm } from "@/modules/venmo/upload";

export const runtime = "nodejs";

/** Receives the same CSV again and returns the PDF report. The file is processed in memory and never stored. */
export async function POST(req: Request) {
  const ctx = await getAppContext();
  if (!ctx || !can(ctx.role, "venmo:read")) return new Response("Not found", { status: 404 });
  const result = await reportFromForm(await req.formData(), ctx.settings.timezone);
  if (!result.ok) return new Response(result.error, { status: 400 });
  const s = ctx.settings;
  const buffer = await renderToBuffer(
    createElement(VenmoPdf, {
      report: result.report, business: { name: ctx.tenant.name }, currency: s.currency, dateFormat: s.date_format, locale: s.doc_locale as "en" | "es",
    }) as Parameters<typeof renderToBuffer>[0],
  );
  const file = `venmo-report-${result.report.from ?? "statement"}_${result.report.to ?? ""}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "private, no-store" },
  });
}
