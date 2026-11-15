import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field } from "@/components/ui";
import { JobFields } from "@/components/jobs/JobFields";
import { isIsoDate } from "@/lib/calendar";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_OPTION_COLUMNS, toCustomerOptions } from "@/modules/customers/options";
import { JobCustomerField } from "@/components/jobs/JobCustomerField";
import { createJob } from "@/modules/jobs/actions";
import { listServiceTypes } from "@/modules/services/queries";

export const metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ customer?: string; error?: string; date?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "jobs:write")) redirect("/jobs");
  const sp = await searchParams;
  const t = await getTranslations("jobs");
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers").select(CUSTOMER_OPTION_COLUMNS).neq("status", "archived").order("first_name").limit(1000);
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
              <JobCustomerField customers={toCustomerOptions(customers ?? [])} initialId={sp.customer} />
            </Field>
            <p className="text-xs text-muted">{t("addressHelp")}</p>
            <JobFields v={{ scheduled_date: isIsoDate(sp.date) ? sp.date : undefined }} services={services} labels={labels} dateFormat={ctx.settings.date_format} currency={ctx.settings.currency} />
            <Button type="submit">{t("create")}</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
