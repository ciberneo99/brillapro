import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { BusinessSettingsForm } from "@/components/BusinessSettingsForm";
import { PreferenceControls } from "@/components/PreferenceControls";
import { Card } from "@/components/ui";
import { LogoCard } from "@/components/LogoCard";
import { getBrand, logoUrl } from "@/lib/logo-server";
import { PlanCard } from "@/components/billing/PlanCard";
import { RequestLinkCard } from "@/components/customers/RequestLinkCard";
import { publicEnv } from "@/lib/env";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { getTheme } from "@/lib/theme";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ logo?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("settings");
  const ts = await getTranslations("services");
  const te = await getTranslations("employees");
  const tt = await getTranslations("team");
  const ti = await getTranslations("invoices");
  const tx = await getTranslations("expenses");
  const tpm = await getTranslations("paymentMethods");
  const tpr = await getTranslations("pricing.settings");
  const theme = await getTheme();
  const s = ctx.settings;
  const [logo, brand] = await Promise.all([logoUrl(s.logo_path), getBrand(ctx.tenant.id)]);
  const logoStatus = ["saved", "removed", "type", "size", "upload", "brand", "brandreset", "nocolor", "badcolor"].includes(sp.logo ?? "") ? sp.logo : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">{t("preferences.title")}</h2>
        <PreferenceControls theme={theme} />
        <p className="text-xs text-muted">{t("preferences.languageHelp")} {t("preferences.themeHelp")}</p>
      </Card>

      <PlanCard tenantId={ctx.tenant.id} dateFormat={ctx.settings.date_format} daysLeft={ctx.trialDaysLeft} />

      <RequestLinkCard
        url={`${publicEnv().NEXT_PUBLIC_APP_URL}/request/${ctx.tenant.public_slug}`}
        enabled={ctx.tenant.accepts_requests}
        canEdit={can(ctx.role, "settings:write")}
      />

      {can(ctx.role, "services:read") && (
        <Link href="/settings/services" className="block">
          <Card accent="teal" className="transition-shadow hover:shadow-md">
            <h2 className="text-base font-semibold">{ts("title")}</h2>
            <p className="mt-1 text-sm text-muted">{ts("intro")}</p>
          </Card>
        </Link>
      )}

      {can(ctx.role, "quotes:read") && (

        <Link href="/settings/pricing" className="block">

          <Card accent="violet" className="transition-shadow hover:shadow-md">

            <h2 className="text-base font-semibold">{tpr("title")}</h2>

            <p className="mt-1 text-sm text-muted">{tpr("cardIntro")}</p>

          </Card>

        </Link>

      )}


      {can(ctx.role, "invoices:read") && (
        <Link href="/settings/invoices" className="block">
          <Card accent="green" className="transition-shadow hover:shadow-md">
            <h2 className="text-base font-semibold">{ti("settings")}</h2>
            <p className="mt-1 text-sm text-muted">{ti("settingsIntro")}</p>
          </Card>
        </Link>
      )}

      <Link href="/settings/payment-methods" className="block">
        <Card accent="teal" className="transition-shadow hover:shadow-md">
          <h2 className="text-base font-semibold">{tpm("title")}</h2>
          <p className="mt-1 text-sm text-muted">{tpm("intro")}</p>
        </Card>
      </Link>

      {can(ctx.role, "expenses:read") && (
        <Link href="/settings/expense-categories" className="block">
          <Card accent="amber" className="transition-shadow hover:shadow-md">
            <h2 className="text-base font-semibold">{tx("categories")}</h2>
            <p className="mt-1 text-sm text-muted">{tx("settingsIntro")}</p>
          </Card>
        </Link>
      )}

      {can(ctx.role, "users:read") && (
        <Link href="/settings/team" className="block">
          <Card accent="blue" className="transition-shadow hover:shadow-md">
            <h2 className="text-base font-semibold">{tt("title")}</h2>
            <p className="mt-1 text-sm text-muted">{tt("intro")}</p>
          </Card>
        </Link>
      )}

      {can(ctx.role, "employees:read") && (
        <Link href="/settings/employees" className="block">
          <Card accent="violet" className="transition-shadow hover:shadow-md">
            <h2 className="text-base font-semibold">{te("title")}</h2>
            <p className="mt-1 text-sm text-muted">{te("intro")}</p>
          </Card>
        </Link>
      )}

      <LogoCard url={logo} canEdit={can(ctx.role, "settings:write")} status={logoStatus} brandColor={brand.color} logoSize={brand.size} />

      <Card>
        <BusinessSettingsForm
          canEdit={can(ctx.role, "settings:write")}
          values={{
            name: ctx.tenant.name, phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "", city: s.city ?? "", state: s.state ?? "", zip_code: s.zip_code ?? "", website: s.website ?? "",
            tax_id: s.tax_id ?? "", currency: s.currency, timezone: s.timezone,
            date_format: s.date_format, doc_locale: s.doc_locale,
          }}
        />
      </Card>
    </div>
  );
}
