import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Select } from "@/components/ui";
import { JobFields } from "@/components/jobs/JobFields";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/modules/customers/schema";
import { createJob } from "@/modules/jobs/actions";
import { listServiceTypes } from "@/modules/services/queries";

export const metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ customer?: string; error?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "jobs:write")) redirect("/jobs");
  const sp = await searchParams;
  const t = await getTranslations("jobs");
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers").select("id,first_name,last_name,company_name").neq("status", "archived").order("first_name").limit(1000);
  const services = (await listServiceTypes()).filter((s) => s.is_active);
  const labels = {
    title: t("titleField"), service: t("service"), noService: t("noService"), date: t("date"), start: t("start"), end: t("end"),
    address: t("address"), access: t("access"), price: t("price"), notes: t("notes"),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/jobs" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("new")}</h1>
      </div>
      {sp.error && <Alert>{t("invalid")}</Alert>}
      {(customers ?? []).length === 0 ? (
        <Card><p className="text-sm">{t("needCustomer")} <Link href="/customers/new" className="text-primary hover:underline">{t("addCustomer")}</Link></p></Card>
      ) : (
        <Card accent="blue">
          <form action={createJob} className="space-y-4">
            <Field label={t("customer")} htmlFor="customer_id">
              <Select id="customer_id" name="customer_id" required defaultValue={sp.customer ?? ""}>
                <option value="" disabled>{t("chooseCustomer")}</option>
                {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{displayName(c)}</option>)}
              </Select>
            </Field>
            <p className="text-xs text-muted">{t("addressHelp")}</p>
            <JobFields v={{}} services={services} labels={labels} dateFormat={ctx.settings.date_format} currency={ctx.settings.currency} />
            <Button type="submit">{t("create")}</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
