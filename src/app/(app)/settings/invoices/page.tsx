import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { saveInvoiceSettings } from "@/modules/invoices/actions";
import { getInvoiceSettings } from "@/modules/invoices/queries";

export const metadata = { title: "Invoice settings" };

export default async function InvoiceSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("invoices");
  const s = await getInvoiceSettings(ctx.tenant.id);
  const canEdit = can(ctx.role, "settings:write");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-muted hover:text-fg">← {t("backSettings")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("settings")}</h1>
        <p className="mt-1 text-sm text-muted">{t("settingsIntro")}</p>
      </div>
      {sp.error && <Alert>{t("invalid")}</Alert>}
      {sp.saved && <Alert tone="success">{t("saved")}</Alert>}
      <Card accent="green">
        <form action={saveInvoiceSettings} className="space-y-4">
          <fieldset disabled={!canEdit} className="space-y-4">
            <Field label={t("prefix")} htmlFor="invoice_prefix" hint={t("prefixHelp")}><Input id="invoice_prefix" name="invoice_prefix" defaultValue={s.invoice_prefix} maxLength={10} /></Field>
            <Field label={t("dueDays")} htmlFor="invoice_due_days"><Input id="invoice_due_days" name="invoice_due_days" type="number" min={0} max={365} defaultValue={s.invoice_due_days} /></Field>
            <Field label={t("defaultTerms")} htmlFor="invoice_terms">
              <textarea id="invoice_terms" name="invoice_terms" rows={6} maxLength={3000} defaultValue={s.invoice_terms ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
            </Field>
          </fieldset>
          {canEdit ? <Button type="submit">{t("save")}</Button> : <p className="text-sm text-muted">{t("settingsReadOnly")}</p>}
        </form>
      </Card>
    </div>
  );
}
