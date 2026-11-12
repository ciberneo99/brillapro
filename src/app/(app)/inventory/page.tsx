import Link from "next/link";
import { ClickableRow } from "@/components/ClickableRow";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, cn } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { listItems } from "@/modules/inventory/queries";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "inventory:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("inventory");
  const showInactive = sp.show === "all";
  const items = await listItems({ showInactive });
  const low = items.filter((i) => i.is_low);
  const value = items.reduce((s, i) => s + (i.is_active && i.unit_cost_cents ? Math.round(i.on_hand * i.unit_cost_cents) : 0), 0);
  const pill = (on: boolean) => cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:bg-surface-2");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {can(ctx.role, "inventory:write") && <Link href="/inventory/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover">{t("new")}</Link>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card accent="rose"><p className="text-sm text-muted">{t("lowStock")}</p><p className="mt-1 text-2xl font-semibold">{low.length}</p></Card>
        <Card accent="teal"><p className="text-sm text-muted">{t("stockValue")}</p><p className="mt-1 text-2xl font-semibold">{formatMoney(value, ctx.settings.currency)}</p></Card>
      </div>

      <div className="flex gap-2">
        <Link href="/inventory" className={pill(!showInactive)}>{t("activeOnly")}</Link>
        <Link href="/inventory?show=all" className={pill(showInactive)}>{t("showAll")}</Link>
      </div>

      {items.length === 0 ? (
        <Card className="text-center"><p className="font-medium">{t("empty")}</p><p className="mt-1 text-sm text-muted">{t("emptyBody")}</p></Card>
      ) : (
        <Card accent="green" className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase text-muted">
              <tr><th className="p-3">{t("name")}</th><th className="p-3 text-right">{t("onHand")}</th><th className="p-3 text-right">{t("minimum")}</th><th className="p-3">{t("status")}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((i) => (
                <ClickableRow key={i.id} href={`/inventory/${i.id}`} className="hover:bg-surface-2">
                  <td className="p-3"><Link href={`/inventory/${i.id}`} className="font-medium text-primary hover:underline">{i.name}</Link></td>
                  <td className="p-3 text-right font-medium">{i.on_hand} <span className="text-muted">{i.unit}</span></td>
                  <td className="p-3 text-right text-muted">{i.min_quantity || "—"}</td>
                  <td className="p-3">
                    {!i.is_active ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{t("inactive")}</span>
                      : i.is_low ? <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">{t("low")}</span>
                      : <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">{t("ok")}</span>}
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
