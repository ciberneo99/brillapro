import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { VenmoUploader } from "@/components/venmo/VenmoUploader";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";

export const metadata = { title: "Bank reports" };

export default async function BankReportsPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "venmo:read")) redirect("/reports");
  const t = await getTranslations("reports");
  const tv = await getTranslations("venmo");
  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-muted hover:text-fg">← {t("backToReports")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("items.bank_reports.title")}</h1>
        <p className="mt-1 text-sm text-muted">{tv("intro")}</p>
      </div>
      <VenmoUploader currency={ctx.settings.currency} dateFormat={ctx.settings.date_format} />
    </div>
  );
}
