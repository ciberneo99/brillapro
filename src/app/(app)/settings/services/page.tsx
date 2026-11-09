import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Input } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { addServiceType, updateServiceType } from "@/modules/services/actions";
import { listServiceTypes } from "@/modules/services/queries";

export const metadata = { title: "Service types" };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "services:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("services");
  const canEdit = can(ctx.role, "services:write");
  const types = await listServiceTypes();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </div>

      {sp.error && <Alert>{t(sp.error === "nameTaken" ? "nameTaken" : "invalid")}</Alert>}
      {sp.saved && <Alert tone="success">{t("saved")}</Alert>}
      {!canEdit && <p className="text-sm text-muted">{t("readOnly")}</p>}

      <Card accent="blue" className="divide-y divide-line p-0">
        {types.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
            <form action={updateServiceType.bind(null, s.id)} className="flex min-w-0 flex-1 items-center gap-2">
              <Input name="name" defaultValue={s.name} maxLength={80} disabled={!canEdit} aria-label={t("name")} className="max-w-xs" />
              {canEdit && <Button type="submit" variant="secondary">{t("saveName")}</Button>}
            </form>
            <span className={`rounded-full px-2 py-0.5 text-xs ${s.is_active ? "bg-success-soft text-success" : "bg-surface-2 text-muted"}`}>
              {s.is_active ? t("active") : t("inactive")}
            </span>
            {s.activeTemplateId ? (
              <Link href={`/notebook/checklists/${s.activeTemplateId}`} className="text-sm text-primary hover:underline">{t("viewTemplate")}</Link>
            ) : (
              <span className="text-xs text-muted">{t("noTemplate")}</span>
            )}
            {canEdit && (
              <form action={updateServiceType.bind(null, s.id)}>
                <input type="hidden" name="is_active" value={String(!s.is_active)} />
                <Button type="submit" variant="ghost">{s.is_active ? t("deactivate") : t("activate")}</Button>
              </form>
            )}
          </div>
        ))}
      </Card>

      {canEdit && (
        <Card accent="green">
          <h2 className="mb-3 text-base font-semibold">{t("add")}</h2>
          <form action={addServiceType} className="flex flex-wrap gap-2">
            <Input name="name" required maxLength={80} placeholder={t("addPlaceholder")} aria-label={t("name")} className="max-w-sm" />
            <Button type="submit">{t("addButton")}</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
