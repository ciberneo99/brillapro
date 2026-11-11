import { Star } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ReportCard } from "@/components/reports/ReportCard";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { REPORTS, SECTIONS } from "@/modules/reports/catalog";
import { listFavorites } from "@/modules/reports/queries";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "reports:read")) redirect("/dashboard");
  const t = await getTranslations("reports");
  const favorites = await listFavorites(ctx.tenant.id, ctx.userId);
  const visible = REPORTS.filter((r) => r.needs.every((p) => can(ctx.role, p)));
  const starred = visible.filter((r) => favorites.has(r.key));

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <section aria-labelledby="favorites">
        <div className="rounded-xl px-5 py-4" style={{ background: "color-mix(in srgb, var(--c-amber) 14%, var(--surface))" }}>
          <h2 id="favorites" className="flex items-center gap-2 text-lg font-semibold"><Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden />{t("favorites")}</h2>
          <p className="text-sm text-muted">{t("favoritesHelp")}</p>
        </div>
        {starred.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("favoritesEmpty")}</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {starred.map((r) => <ReportCard key={r.key} report={r} favorite />)}
          </ul>
        )}
      </section>

      {SECTIONS.map((s) => {
        const items = visible.filter((r) => r.section === s.id);
        if (items.length === 0) return null;
        return (
          <section key={s.id} aria-labelledby={`sec-${s.id}`}>
            <div className="rounded-xl px-5 py-4" style={{ background: `color-mix(in srgb, var(--c-${s.accent}) 14%, var(--surface))` }}>
              <h2 id={`sec-${s.id}`} className="text-lg font-semibold">{t(`sections.${s.id}.title`)}</h2>
              <p className="text-sm text-muted">{t(`sections.${s.id}.desc`)}</p>
            </div>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {items.map((r) => <ReportCard key={r.key} report={r} favorite={favorites.has(r.key)} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
