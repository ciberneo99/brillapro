import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Input, cn } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { addPaymentMethod, renamePaymentMethod, togglePaymentMethod } from "@/modules/payment-methods/actions";
import { listPaymentMethods } from "@/modules/payment-methods/queries";
import { SavedToast } from "@/components/ui/SavedToast";

export const metadata = { title: "Payment methods" };

export default async function PaymentMethodsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("paymentMethods");
  const canEdit = can(ctx.role, "settings:write");
  const methods = await listPaymentMethods();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </div>
      {sp.error && <Alert>{t(sp.error === "duplicate" ? "duplicate" : "invalid")}</Alert>}
      {sp.saved && <SavedToast>{t("saved")}</SavedToast>}
      {!canEdit && <p className="text-sm text-muted">{t("readOnly")}</p>}

      {canEdit && (
        <Card accent="green">
          <h2 className="mb-3 text-base font-semibold">{t("add")}</h2>
          <form action={addPaymentMethod} className="flex gap-2">
            <Input name="name" required maxLength={60} placeholder={t("name")} aria-label={t("name")} />
            <Button type="submit">{t("addButton")}</Button>
          </form>
        </Card>
      )}

      <Card>
        <ul className="divide-y divide-line">
          {methods.map((m) => (
            <li key={m.id} className={cn("flex items-center gap-2 py-2", !m.is_active && "opacity-60")}>
              {canEdit ? (
                <>
                  <form action={renamePaymentMethod.bind(null, m.id)} className="flex min-w-0 flex-1 items-center gap-2">
                    <Input name="name" defaultValue={m.name} required maxLength={60} aria-label={t("name")} className="h-9" />
                    <Button type="submit" variant="secondary" className="h-9">{t("save")}</Button>
                  </form>
                  <form action={togglePaymentMethod.bind(null, m.id, !m.is_active)}>
                    <Button type="submit" variant="ghost" className="h-9">{m.is_active ? t("hide") : t("show")}</Button>
                  </form>
                </>
              ) : (
                <span className="flex-1">{m.name}{!m.is_active && <span className="ml-2 text-xs text-muted">{t("hidden")}</span>}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{t("help")}</p>
      </Card>
    </div>
  );
}
