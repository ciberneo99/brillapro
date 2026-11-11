import { todayIso } from "@/lib/calendar";
import { can } from "@/lib/permissions";
import { getAppContext } from "@/lib/session";
import { reportByKey } from "@/modules/reports/catalog";
import { buildRunCtx } from "@/modules/reports/context";
import { parsePeriod } from "@/modules/reports/period";
import { toCsv } from "@/modules/reports/csv";
import { runReport } from "@/modules/reports/run";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getAppContext();
  if (!ctx || !can(ctx.role, "reports:read")) return new Response("Not found", { status: 404 });
  const { key } = await params;
  const def = reportByKey(key);
  if (!def || !def.csv || def.unavailable || !def.needs.every((p) => can(ctx.role, p))) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const today = todayIso(ctx.settings.timezone);
  const period = parsePeriod({ month: q.get("month") ?? undefined, year: q.get("year") ?? undefined, from: q.get("from") ?? undefined, to: q.get("to") ?? undefined }, today);
  const result = await runReport(key, await buildRunCtx(ctx, period));
  if (!result) return new Response("Not found", { status: 404 });
  const file = `${key}${def.ranged ? `_${period.from}_${period.to}` : `_${today}`}.csv`;
  return new Response(toCsv(result), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "private, no-store" },
  });
}
