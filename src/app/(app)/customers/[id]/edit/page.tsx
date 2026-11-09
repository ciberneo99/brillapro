import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { updateCustomer } from "@/modules/customers/actions";
import { getCustomer } from "@/modules/customers/queries";
import { centsToInput } from "@/modules/customers/schema";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  if (!can(ctx.role, "customers:write")) redirect(`/customers/${id}`);
  const c = await getCustomer(id);
  if (!c) notFound();
  const t = await getTranslations("customers");

  const s = (v: string | number | null) => (v == null ? "" : String(v));
  const values = {
    first_name: c.first_name, last_name: c.last_name, company_name: c.company_name, email: s(c.email), phone: s(c.phone),
    secondary_phone: s(c.secondary_phone), service_address: s(c.service_address), billing_address: s(c.billing_address),
    city: s(c.city), state: s(c.state), zip_code: s(c.zip_code), property_type: s(c.property_type),
    square_footage: s(c.square_footage), bedrooms: s(c.bedrooms), bathrooms: s(c.bathrooms),
    cleaning_frequency: s(c.cleaning_frequency), preferred_service: s(c.preferred_service),
    estimated_price: centsToInput(c.estimated_price_cents), access_instructions: s(c.access_instructions),
    pets: s(c.pets), special_instructions: s(c.special_instructions), notes: s(c.notes), customer_since: s(c.customer_since),
  };

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h1>
      <CustomerForm currency={ctx.settings.currency} dateFormat={ctx.settings.date_format} action={updateCustomer.bind(null, id)} values={values} cancelHref={`/customers/${id}`} submitLabel={(await getTranslations("common"))("save")} />
    </div>
  );
}
