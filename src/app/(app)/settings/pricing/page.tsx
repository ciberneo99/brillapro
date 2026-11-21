import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui";
import { PricingSettingsForm, ResetRatesButton } from "@/components/pricing/PricingSettingsForm";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { resetPricingSettings } from "@/modules/pricing/actions";
import { getPricingConfig } from "@/modules/pricing/queries";
import { SavedToast } from "@/components/ui/SavedToast";

export const metadata = { title: "Price calculator" };

export default async function PricingSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; reset?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("pricing.settings");
  const { config, custom } = await getPricingConfig(ctx.tenant.id);
  const canEdit = can(ctx.role, "settings:write");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">{custom ? t("custom") : t("austin")}</span>
        </div>
        <p className="mt-1 text-sm text-muted">{t("intro")} {!custom && t("startHelp")}</p>
      </div>
      {sp.error && <Alert>{t("error")}</Alert>}
      {sp.saved && <SavedToast>{t("saved")}</SavedToast>}
      {sp.reset && <SavedToast param="reset">{t("resetDone")}</SavedToast>}

      <PricingSettingsForm key={custom ? "custom" : "default"} config={config} canEdit={canEdit} />

      {canEdit && custom && <ResetRatesButton action={resetPricingSettings} />}
    </div>
  );
}
