import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { BusinessSettingsForm } from "@/components/BusinessSettingsForm";
import { PreferenceControls } from "@/components/PreferenceControls";
import { Card } from "@/components/ui";
import { RequestLinkCard } from "@/components/customers/RequestLinkCard";
import { publicEnv } from "@/lib/env";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { getTheme } from "@/lib/theme";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:read")) redirect("/dashboard");
  const t = await getTranslations("settings");
  const ts = await getTranslations("services");
  const te = await getTranslations("employees");
  const theme = await getTheme();
  const s = ctx.settings;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">{t("preferences.title")}</h2>
        <PreferenceControls theme={theme} />
        <p className="text-xs text-muted">{t("preferences.languageHelp")} {t("preferences.themeHelp")}</p>
      </Card>

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

      {can(ctx.role, "employees:read") && (
        <Link href="/settings/employees" className="block">
          <Card accent="violet" className="transition-shadow hover:shadow-md">
            <h2 className="text-base font-semibold">{te("title")}</h2>
            <p className="mt-1 text-sm text-muted">{te("intro")}</p>
          </Card>
        </Link>
      )}

      <Card>
        <BusinessSettingsForm
          canEdit={can(ctx.role, "settings:write")}
          values={{
            name: ctx.tenant.name, phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "",
            tax_id: s.tax_id ?? "", currency: s.currency, timezone: s.timezone,
            date_format: s.date_format, doc_locale: s.doc_locale,
          }}
        />
      </Card>
    </div>
  );
}
