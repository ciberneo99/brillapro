import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Select } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/modules/customers/schema";
import { createQuote } from "@/modules/quotes/actions";
import { listServiceTypes } from "@/modules/services/queries";

export const metadata = { title: "New quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ customer?: string; error?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "quotes:write")) redirect("/quotes");
  const sp = await searchParams;
  const t = await getTranslations("quotes");
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers").select("id,first_name,last_name,company_name")
    .neq("status", "archived").order("first_name").limit(1000);
  const services = (await listServiceTypes()).filter((s) => s.is_active);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/quotes" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("new")}</h1>
      </div>
      {sp.error && <Alert>{t("invalid")}</Alert>}
      {(customers ?? []).length === 0 ? (
        <Card><p className="text-sm">{t("needCustomer")} <Link href="/customers/new" className="text-primary hover:underline">{t("addCustomer")}</Link></p></Card>
      ) : (
        <Card accent="violet">
          <form action={createQuote} className="space-y-4">
            <Field label={t("customer")} htmlFor="customer_id">
              <Select id="customer_id" name="customer_id" required defaultValue={sp.customer ?? ""}>
                <option value="" disabled>{t("chooseCustomer")}</option>
                {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{displayName(c)}</option>)}
              </Select>
            </Field>
            <Field label={t("service")} htmlFor="service_type_id">
              <Select id="service_type_id" name="service_type_id" defaultValue="">
                <option value="">{t("noService")}</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="tiers" defaultChecked className="h-4 w-4" /> {t("startTiers")}
            </label>
            <Button type="submit">{t("create")}</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
