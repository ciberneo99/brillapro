import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { fullAddress } from "@/lib/business";
import { logoForPdf } from "@/lib/logo-server";
import { quoteNumber } from "@/lib/money";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/session";
import { InvoicePdf } from "@/modules/invoices/pdf";
import { getInvoice, getInvoiceSettings } from "@/modules/invoices/queries";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAppContext();
  if (!ctx || !can(ctx.role, "invoices:read")) return new Response("Not found", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const invoice = await getInvoice(id); // RLS: only this company's invoices
  if (!invoice) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: cust } = await supabase.from("customers").select("phone,company_name").eq("id", invoice.customer_id).maybeSingle();
  const is = await getInvoiceSettings(ctx.tenant.id);
  const s = ctx.settings;
  const logo = await logoForPdf(s.logo_path);

  const buffer = await renderToBuffer(
    createElement(InvoicePdf, {
      invoice, logo, customerPhone: invoice.customer_phone ?? (invoice.status === "draft" ? cust?.phone ?? null : null), customerCompany: cust?.company_name || null, prefix: is.invoice_prefix, currency: s.currency, dateFormat: s.date_format, locale: s.doc_locale as "en" | "es",
      business: { name: ctx.tenant.name, phone: s.phone, email: s.email, address: fullAddress(s), website: s.website, tax_id: s.tax_id },
    }) as Parameters<typeof renderToBuffer>[0],
  );
  const file = `${quoteNumber(is.invoice_prefix, invoice.number)}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${new URL(req.url).searchParams.has("download") ? "attachment" : "inline"}; filename="${file}"`, "Cache-Control": "private, no-store" },
  });
}
