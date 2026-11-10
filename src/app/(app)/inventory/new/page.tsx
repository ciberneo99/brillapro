import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card } from "@/components/ui";
import { ItemFields } from "@/components/inventory/ItemFields";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createItem } from "@/modules/inventory/actions";

export const metadata = { title: "New item" };

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "inventory:write")) redirect("/inventory");
  const sp = await searchParams;
  const t = await getTranslations("inventory");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/inventory" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("new")}</h1>
      </div>
      {sp.error && <Alert>{t(sp.error === "taken" ? "nameTaken" : "invalid")}</Alert>}
      <Card accent="green">
        <form action={createItem} className="space-y-4">
          <ItemFields currency={ctx.settings.currency} />
          <Button type="submit">{t("save")}</Button>
        </form>
      </Card>
    </div>
  );
}
