import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { getPlanOverview } from "@/modules/billing/queries";

/** Settings card: current plan, trial days left, seats in use, and the plans on offer. No payments yet. */
export async function PlanCard({ tenantId, dateFormat, daysLeft }: { tenantId: string; dateFormat: string; daysLeft: number | null }) {
  const t = await getTranslations("plan");
  const o = await getPlanOverview(tenantId);
  if (!o) return null;
  const seatsFull = o.maxUsers !== null && o.users >= o.maxUsers;
  const customersFull = o.maxCustomers !== null && o.customers >= o.maxCustomers;
  const trialEnded = o.status === "trialing" && daysLeft === 0;

  return (
    <Card accent="violet" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted">{o.status === "trialing" ? t("trialPlan") : o.planName}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${o.status === "active" ? "bg-success-soft text-success" : trialEnded || o.status === "past_due" || o.status === "suspended" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}>
          {o.status === "trialing" ? (trialEnded ? t("trialEnded") : t("trialDays", { days: daysLeft ?? 0 })) : t(`status.${o.status}`)}
        </span>
      </div>

      {o.status === "trialing" && o.trialEndsAt && <p className="text-sm text-muted">{t("trialUntil", { date: formatDateOnly(o.trialEndsAt, dateFormat) })}</p>}

      <div>
        <p className="text-sm">{t("people")}: <strong>{o.users}{o.maxUsers !== null ? ` / ${o.maxUsers}` : ""}</strong></p>
        {o.maxUsers !== null && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={o.users} aria-valuemin={0} aria-valuemax={o.maxUsers} aria-label={t("people")}>
            <div className={`h-full ${seatsFull ? "bg-danger" : "bg-primary"}`} style={{ width: `${Math.min(100, Math.round((o.users / o.maxUsers) * 100))}%` }} />
          </div>
        )}
        {seatsFull && <p className="mt-2 text-xs text-danger">{t("seatsFull")}</p>}
      </div>

      {o.maxCustomers !== null && (
        <div>
          <p className="text-sm">{t("customers")}: <strong>{o.customers} / {o.maxCustomers}</strong></p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={o.customers} aria-valuemin={0} aria-valuemax={o.maxCustomers} aria-label={t("customers")}>
            <div className={`h-full ${customersFull ? "bg-danger" : "bg-primary"}`} style={{ width: `${Math.min(100, Math.round((o.customers / o.maxCustomers) * 100))}%` }} />
          </div>
          {customersFull && <p className="mt-2 text-xs text-danger">{t("customersFull")}</p>}
        </div>
      )}

      <div className="border-t border-line pt-3">
        <p className="mb-2 text-xs font-medium uppercase text-muted">{t("available")}</p>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {PLANS.map((p) => (
            <li key={p.id} className="rounded-lg border border-line p-3">
              <p className="font-medium">{t(`names.${p.id}`)}</p>
              <p className="text-muted">{formatMoney(p.monthlyCents, "USD").replace(".00", "")} {t("perMonth")}</p>
              <p className="text-xs text-muted">{t("upTo", { count: p.maxUsers })} · {p.maxCustomers === null ? t("unlimitedCustomers") : t("customersUpTo", { count: p.maxCustomers })}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{t("billingSoon")}</p>
      </div>
    </Card>
  );
}
