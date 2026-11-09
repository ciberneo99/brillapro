import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, cn } from "@/components/ui";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { todayIso } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { formatTime } from "@/lib/time";
import { listJobs, PAGE_SIZE } from "@/modules/jobs/queries";
import { JOB_STATUSES } from "@/modules/jobs/schema";

export const metadata = { title: "Jobs" };
type SP = { status?: string; page?: string; when?: string };

export default async function JobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "jobs:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("jobs");
  const staff = can(ctx.role, "jobs:write");
  const today = todayIso(ctx.settings.timezone);
  const upcoming = sp.when === "upcoming";
  const { rows, total, page } = await listJobs({
    status: sp.status, page: Number(sp.page) || 1,
    ...(upcoming ? { from: today, asc: true } : {}),
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const active = (JOB_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const href = (o: { status?: string; when?: string; page?: string }) => {
    const p = new URLSearchParams();
    if (o.status) p.set("status", o.status);
    if (o.when) p.set("when", o.when);
    if (o.page) p.set("page", o.page);
    const q = p.toString();
    return q ? `/jobs?${q}` : "/jobs";
  };
  const pill = (on: boolean) => cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:bg-surface-2");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex gap-2">
        <Link href="/calendar" className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">{t("calendar")}</Link>
        {staff && <Link href="/jobs/recurring" className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">{t("recurring")}</Link>}
        {staff && <Link href="/jobs/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover">{t("new")}</Link>}
        </div>
      </div>
      {!staff && <p className="text-sm text-muted">{t("employeeNote")}</p>}

      <div className="flex flex-wrap gap-2">
        <Link href={href({ when: upcoming ? "upcoming" : undefined })} className={pill(!active)}>{t("all")}</Link>
        {JOB_STATUSES.map((s) => <Link key={s} href={href({ status: s, when: upcoming ? "upcoming" : undefined })} className={pill(active === s)}>{t(`status.${s}`)}</Link>)}
        <span className="mx-1 border-l border-line" />
        <Link href={href({ status: active, when: upcoming ? undefined : "upcoming" })} className={pill(upcoming)}>{t("upcoming")}</Link>
      </div>

      {rows.length === 0 ? (
        <Card className="text-center"><p className="font-medium">{t("empty")}</p><p className="mt-1 text-sm text-muted">{t("emptyBody")}</p></Card>
      ) : (
        <Card accent="blue" className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase text-muted">
              <tr><th className="p-3">{t("date")}</th><th className="p-3">{t("job")}</th><th className="p-3">{t("address")}</th><th className="p-3">{t("statusLabel")}</th>{staff && <th className="p-3 text-right">{t("price")}</th>}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <td className="whitespace-nowrap p-3">{formatDateOnly(r.scheduled_date, ctx.settings.date_format)}{r.start_time && <span className="block text-xs text-muted">{formatTime(r.start_time)}</span>}</td>
                  <td className="p-3"><Link href={`/jobs/${r.id}`} className="font-medium text-primary hover:underline">{r.title}</Link><span className="block text-xs text-muted">{r.customer_name}</span></td>
                  <td className="p-3 text-muted">{r.address}</td>
                  <td className="p-3"><JobStatusBadge status={r.status} /></td>
                  {staff && <td className="p-3 text-right">{formatMoney(r.price_cents, ctx.settings.currency)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">{t("page", { page, pages })}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2" href={href({ status: active, when: sp.when, page: String(page - 1) })}>{t("prev")}</Link>}
            {page < pages && <Link className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2" href={href({ status: active, when: sp.when, page: String(page + 1) })}>{t("next")}</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
