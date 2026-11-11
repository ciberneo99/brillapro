import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Card } from "@/components/ui";
import { NewQuoteForm } from "@/components/quotes/NewQuoteForm";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/modules/customers/schema";
import { listServiceTypes } from "@/modules/services/queries";

export const metadata = { title: "New quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ customer?: string; error?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "quotes:write")) redirect("/quotes");
  const sp = await searchParams;
  const t = await getTranslations("quotes");
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers").select("id,first_name,last_name,company_name,email,phone,billing_address,service_address,city,state,zip_code")
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
          <NewQuoteForm
            initialId={sp.customer ?? null} services={services.map((x) => ({ id: x.id, name: x.name }))}
            customers={(customers ?? []).map((c) => ({
              id: c.id, name: displayName(c), email: c.email, phone: c.phone, company: c.company_name || null,
              address: [c.service_address || c.billing_address, c.city, [c.state, c.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
            }))}
          />
        </Card>
      )}
    </div>
  );
}
