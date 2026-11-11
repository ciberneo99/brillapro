import Link from "next/link";
import { BarChart3, Download, Lock, FileText, Landmark, LayoutDashboard, Receipt, ShoppingCart, Star, TrendingUp, Users, Clock, DollarSign, CreditCard, Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/components/ui";
import { toggleFavorite } from "@/modules/reports/actions";
import type { ReportDef, ReportIcon } from "@/modules/reports/catalog";

const ICONS: Record<ReportIcon, typeof BarChart3> = {
  "file-text": FileText, "shopping-cart": ShoppingCart, users: Users, clock: Clock, dollar: DollarSign, "credit-card": CreditCard,
  wallet: Wallet, "trending-up": TrendingUp, receipt: Receipt, landmark: Landmark, layout: LayoutDashboard,
};

/** One report in the hub: icon, name, short description, View, CSV download and a star to pin it to Favorites. */
export async function ReportCard({ report, favorite, locked = false }: { report: ReportDef; favorite: boolean; locked?: boolean }) {
  const t = await getTranslations("reports");
  const Icon = ICONS[report.icon];
  const href = report.href ?? `/reports/${report.key}`;
  const title = t(`items.${report.key}.title`);
  return (
    <li className={cn("flex flex-col rounded-xl border bg-surface p-4 shadow-card", favorite ? "border-primary ring-2 ring-primary" : "border-line", (report.unavailable || locked) && "opacity-80")}>
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-muted"><Icon className="h-5 w-5" aria-hidden /></span>
        <form action={toggleFavorite.bind(null, report.key)}>
          <button type="submit" aria-pressed={favorite} aria-label={t(favorite ? "unstar" : "star", { name: title })} title={t(favorite ? "unstar" : "star", { name: title })}
            className="rounded p-1 text-muted hover:text-fg">
            <Star className={cn("h-5 w-5", favorite && "fill-amber-400 text-amber-400")} aria-hidden />
          </button>
        </form>
      </div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-muted">{t(`items.${report.key}.desc`)}</p>
      {report.unavailable && <p className="mt-2 rounded-lg bg-warning-soft px-2 py-1 text-xs text-warning">{t(`items.${report.key}.why`)}</p>}
      {locked && <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary-soft px-2 py-1 text-xs text-primary"><Lock className="h-3.5 w-3.5" aria-hidden />{t("proOnly")}</p>}
      <div className="mt-4 flex items-center justify-between">
        {locked ? (
          <Link href="/settings#plan" className="text-sm font-medium text-primary hover:underline">{t("upgrade")} →</Link>
        ) : report.unavailable ? (
          <span className="text-sm text-muted">{t("notYet")}</span>
        ) : (
          <Link href={href} className="text-sm font-medium text-primary hover:underline">{t("view")} →</Link>
        )}
        {report.csv && !report.unavailable && !locked && (
          <a href={`/reports/${report.key}/csv`} aria-label={t("downloadCsv", { name: title })} title={t("downloadCsv", { name: title })} className="rounded p-1 text-muted hover:text-fg">
            <Download className="h-5 w-5" aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}
