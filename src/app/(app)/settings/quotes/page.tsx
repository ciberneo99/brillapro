import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { saveQuoteSettings } from "@/modules/quotes/actions";
import { getQuoteSettings } from "@/modules/quotes/queries";

export const metadata = { title: "Quote settings" };

export default async function QuoteSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("quotes");
  const s = await getQuoteSettings(ctx.tenant.id);
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
      <Card accent="violet">
        <form action={saveQuoteSettings} className="space-y-4">
          <fieldset disabled={!canEdit} className="space-y-4">
            <Field label={t("prefix")} htmlFor="quote_prefix" hint={t("prefixHelp")}><Input id="quote_prefix" name="quote_prefix" defaultValue={s.quote_prefix} maxLength={10} /></Field>
            <Field label={t("validDays")} htmlFor="quote_valid_days"><Input id="quote_valid_days" name="quote_valid_days" type="number" min={1} max={365} defaultValue={s.quote_valid_days} /></Field>
            <Field label={t("defaultTax")} htmlFor="default_tax_rate"><Input id="default_tax_rate" name="default_tax_rate" inputMode="decimal" defaultValue={String(s.default_tax_rate)} maxLength={6} /></Field>
            <Field label={t("defaultTerms")} htmlFor="quote_terms">
              <textarea id="quote_terms" name="quote_terms" rows={6} maxLength={3000} defaultValue={s.quote_terms ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
            </Field>
          </fieldset>
          {canEdit ? <Button type="submit">{t("saveDetails")}</Button> : <p className="text-sm text-muted">{t("settingsReadOnly")}</p>}
        </form>
      </Card>
    </div>
  );
}
