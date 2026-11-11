import { can } from "@/lib/permissions";
import { getAppContext } from "@/lib/session";
import { customersTemplateCsv } from "@/modules/customers/csv";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getAppContext();
  if (!ctx || !can(ctx.role, "customers:write")) return new Response("Not found", { status: 404 });
  return new Response(customersTemplateCsv(), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="customers_template.csv"', "Cache-Control": "private, no-store" },
  });
}
