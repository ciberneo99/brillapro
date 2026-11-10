import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { VenmoUploader } from "@/components/venmo/VenmoUploader";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";

export const metadata = { title: "Venmo report" };

export default async function VenmoPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "venmo:read")) redirect("/dashboard");
  const t = await getTranslations("venmo");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </div>
      <VenmoUploader currency={ctx.settings.currency} dateFormat={ctx.settings.date_format} />
    </div>
  );
}
