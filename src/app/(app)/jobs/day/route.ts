import { isIsoDate } from "@/lib/calendar";
import { can } from "@/lib/permissions";
import { getAppContext } from "@/lib/session";
import { jobsInRange } from "@/modules/jobs/queries";

/** The day's jobs (no cancelled ones), for the "already scheduled" strip in the new-job form. */
export async function GET(req: Request) {
  const ctx = await getAppContext();
  if (!ctx || !can(ctx.role, "jobs:write")) return new Response("Not found", { status: 404 });
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!isIsoDate(date)) return Response.json([]);
  const jobs = await jobsInRange(date, date);
  return Response.json(
    jobs.map((j) => ({ id: j.id, title: j.title, customer: j.customer_name, start: j.start_time, end: j.end_time })),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
