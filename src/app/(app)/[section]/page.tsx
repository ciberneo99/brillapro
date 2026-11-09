import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { NAV } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";

/** Placeholder for modules built in later phases. Still enforces the permission check. */
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const item = NAV.find((n) => n.href === `/${section}`);
  if (!item) notFound();

  const ctx = await requireContext();
  if (!can(ctx.role, `${item.resource}:read`)) redirect("/dashboard");

  const t = await getTranslations();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t(`nav.${item.key}`)}</h1>
      <Card className="text-center">
        <p className="font-medium">{t("common.comingSoon")}</p>
        <p className="mt-1 text-sm text-muted">{t("common.comingSoonBody")}</p>
      </Card>
    </div>
  );
}
