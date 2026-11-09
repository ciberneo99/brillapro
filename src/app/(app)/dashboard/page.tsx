import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { redirect } from "next/navigation";

const CARDS = [
  "revenueMonth", "revenueYtd", "outstanding", "collected", "customers",
  "activeJobs", "upcoming", "expenses", "profit",
] as const;

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "dashboard:read")) redirect("/jobs");
  const t = await getTranslations("dashboard");

  const daysLeft = ctx.trialDaysLeft;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("welcome", { name: ctx.profile.full_name || ctx.email })}</p>
        </div>
        {daysLeft !== null && (
          <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning">{t("trial", { days: daysLeft })}</span>
        )}
      </header>

      {/* Phase 1: no business data exists yet, so every figure is an honest empty state, not sample data. */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((key) => (
          <Card key={key}>
            <p className="text-sm text-muted">{t(`cards.${key}`)}</p>
            <p className="mt-2 text-2xl font-semibold text-muted" aria-label="—">—</p>
          </Card>
        ))}
      </section>

      <Card className="text-center">
        <p className="font-medium">{t("emptyTitle")}</p>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted">{t("emptyBody")}</p>
      </Card>
    </div>
  );
}
