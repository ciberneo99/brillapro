import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert, Card } from "@/components/ui";
import { NewJobForm } from "@/components/jobs/NewJobForm";
import { isIsoDate } from "@/lib/calendar";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_OPTION_COLUMNS, toCustomerOptions } from "@/modules/customers/options";
import { listEmployees } from "@/modules/employees/module";
import { createJob } from "@/modules/jobs/actions";
import { listServiceTypes } from "@/modules/services/queries";

export const metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ customer?: string; error?: string; date?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "jobs:write")) redirect("/jobs");
  const sp = await searchParams;
  const t = await getTranslations("jobs");
  const supabase = await createClient();
  const [{ data: customers }, services, employees] = await Promise.all([
    supabase.from("customers").select(CUSTOMER_OPTION_COLUMNS).neq("status", "archived").order("first_name").limit(1000),
    listServiceTypes(),
    listEmployees({ activeOnly: true }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.error && <Alert>{t("invalid")}</Alert>}
      {(customers ?? []).length === 0 ? (
        <Card><p className="text-sm">{t("needCustomer")} <Link href="/customers/new" className="text-primary hover:underline">{t("addCustomer")}</Link></p></Card>
      ) : (
        <NewJobForm
          action={createJob}
          customers={toCustomerOptions(customers ?? [])}
          initialCustomerId={sp.customer}
          services={services.filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name }))}
          employees={employees.map((e) => ({ id: e.id, full_name: e.full_name }))}
          initialDate={isIsoDate(sp.date) ? sp.date : undefined}
          dateFormat={ctx.settings.date_format}
          currency={ctx.settings.currency}
        />
      )}
    </div>
  );
}
