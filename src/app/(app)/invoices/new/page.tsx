import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Card } from "@/components/ui";
import { NewInvoiceForm } from "@/components/invoices/NewInvoiceForm";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/modules/customers/schema";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ customer?: string; error?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "invoices:write")) redirect("/invoices");
  const sp = await searchParams;
  const t = await getTranslations("invoices");
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers").select("id,first_name,last_name,company_name,email,phone,billing_address,service_address,city,state,zip_code").neq("status", "archived").order("first_name").limit(1000);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/invoices" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("new")}</h1>
        <p className="mt-1 text-sm text-muted">{t("newHelp")}</p>
      </div>
      {sp.error && <Alert>{t("invalid")}</Alert>}
      {(customers ?? []).length === 0 ? (
        <Card><p className="text-sm">{t("needCustomer")} <Link href="/customers/new" className="text-primary hover:underline">{t("addCustomer")}</Link></p></Card>
      ) : (
        <Card accent="green">
          <NewInvoiceForm initialId={sp.customer ?? null} customers={(customers ?? []).map((c) => ({
            id: c.id, name: displayName(c), email: c.email, phone: c.phone,
            address: [c.billing_address || c.service_address, c.city, [c.state, c.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
          }))} />
        </Card>
      )}
    </div>
  );
}
