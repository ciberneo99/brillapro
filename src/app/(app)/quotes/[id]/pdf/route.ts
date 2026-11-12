import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { can } from "@/lib/permissions";
import { getAppContext } from "@/lib/session";
import { QuotePdf } from "@/modules/quotes/pdf";
import { getQuote, getQuoteSettings } from "@/modules/quotes/queries";
import { fullAddress } from "@/lib/business";
import { readableOnWhite } from "@/lib/brand-color";
import { getBrand, logoForPdf } from "@/lib/logo-server";
import { quoteNumber } from "@/lib/money";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAppContext();
  if (!ctx || !can(ctx.role, "quotes:read")) return new Response("Not found", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const quote = await getQuote(id); // RLS: only this company's quotes
  if (!quote) return new Response("Not found", { status: 404 });
  const qs = await getQuoteSettings(ctx.tenant.id);
  const s = ctx.settings;
  const [logo, brand] = await Promise.all([logoForPdf(s.logo_path), getBrand(ctx.tenant.id)]);

  const buffer = await renderToBuffer(
    createElement(QuotePdf, {
      brand: brand.color ? readableOnWhite(brand.color) : null, logoSize: brand.size,
      quote, logo, prefix: qs.quote_prefix, currency: s.currency, dateFormat: s.date_format, locale: s.doc_locale as "en" | "es",
      business: { name: ctx.tenant.name, phone: s.phone, email: s.email, address: fullAddress(s), website: s.website, tax_id: s.tax_id },
    }) as Parameters<typeof renderToBuffer>[0],
  );
  const file = `${quoteNumber(qs.quote_prefix, quote.number)}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${new URL(req.url).searchParams.has("download") ? "attachment" : "inline"}; filename="${file}"`, "Cache-Control": "private, no-store" },
  });
}
