import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createTemplate } from "@/modules/checklists/actions";
import { listTemplates } from "@/modules/checklists/queries";
import { listServiceTypes } from "@/modules/services/queries";

export const metadata = { title: "Cleaning Checklist" };

export default async function ChecklistsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "checklists:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("checklists");
  const canEdit = can(ctx.role, "checklists:write");
  const [templates, types] = await Promise.all([listTemplates(), listServiceTypes()]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/notebook" className="text-sm text-muted hover:text-fg">← {t("backNotebook")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </div>
      {sp.error && <Alert>{t("invalid")}</Alert>}

      {types.map((s) => {
        const list = templates.filter((x) => x.service_type_id === s.id);
        return (
          <Card key={s.id} accent="teal" className={s.is_active ? "" : "opacity-70"}>
            <h2 className="mb-3 text-base font-semibold">{s.name}</h2>
            {list.length === 0 ? (
              <p className="text-sm text-muted">{t("noTemplates")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((x) => (
                  <li key={x.id}>
                    <Link href={`/notebook/checklists/${x.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-primary">
                      <span className="font-medium">{x.name}</span>
                      <span className="flex items-center gap-3 text-xs text-muted">
                        {t("tasks", { count: x.item_count })}
                        <span className={`rounded-full px-2 py-0.5 ${x.is_active ? "bg-success-soft text-success" : "bg-surface-2"}`}>
                          {x.is_active ? t("active") : t("inactive")}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}

      {canEdit && types.length > 0 && (
        <Card accent="green">
          <h2 className="mb-3 text-base font-semibold">{t("newTemplate")}</h2>
          <form action={createTemplate} className="grid gap-3 sm:grid-cols-2">
            <Field label={t("templateName")} htmlFor="name"><Input id="name" name="name" required maxLength={120} /></Field>
            <Field label={t("serviceType")} htmlFor="service_type_id">
              <Select id="service_type_id" name="service_type_id" required>
                {types.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2"><Button type="submit">{t("create")}</Button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
