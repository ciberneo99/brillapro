import { todayIso } from "@/lib/calendar";
import { can } from "@/lib/permissions";
import { getAppContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { customersToCsv } from "@/modules/customers/csv";
import { listAllCustomers } from "@/modules/customers/queries";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getAppContext();
  if (!ctx || !can(ctx.role, "customers:read")) return new Response("Not found", { status: 404 });
  const rows = await listAllCustomers(await createClient());
  return new Response(customersToCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="customers_${todayIso(ctx.settings.timezone)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
