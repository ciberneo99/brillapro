import { getTranslations } from "next-intl/server";
import { formatDateOnly } from "@/lib/dates";
import { formatMinutes, type CustomerExtras } from "@/modules/customers/list-extras";

/** Hours clocked on the customer's latest job against the scheduled time. The bar turns amber near the plan and red past it. */
export async function TimeBar({ x, dateFormat }: { x: CustomerExtras | undefined; dateFormat: string }) {
  const t = await getTranslations("customers.time");
  if (!x || !x.job_id) return <span className="text-muted" aria-label={t("none")}>—</span>;

  const actual = x.actual_minutes ?? 0;
  const planned = x.planned_minutes;
  const running = x.job_status === "in_progress";
  const ratio = planned && planned > 0 ? actual / planned : null;
  const pct = ratio === null ? 0 : Math.min(100, Math.round(ratio * 100));
  const tone = ratio === null ? "bg-primary" : ratio > 1 ? "bg-danger" : ratio >= 0.9 ? "bg-warning" : "bg-success";

  return (
    <div className="min-w-28 max-w-40">
      <p className="text-sm font-semibold">
        {formatMinutes(actual)}
        {planned ? <span className="font-normal text-muted"> {t("of", { planned: formatMinutes(planned) })}</span> : null}
      </p>
      {planned ? (
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
          aria-label={ratio !== null && ratio > 1 ? t("over") : undefined}
          className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <p className="mt-0.5 text-xs text-muted">{t("noPlan")}</p>
      )}
      <p className="mt-1 truncate text-xs text-muted">
        {running ? t("running") : x.job_date ? t("last", { date: formatDateOnly(x.job_date, dateFormat) }) : ""}
        {x.crew && x.crew > 1 ? ` · ${t("crew", { count: x.crew })}` : ""}
      </p>
    </div>
  );
}
