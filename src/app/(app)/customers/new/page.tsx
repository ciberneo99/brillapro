import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createCustomer } from "@/modules/customers/actions";

export const metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "customers:write")) redirect("/customers");
  const t = await getTranslations("customers");
  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("newTitle")}</h1>
      <CustomerForm action={createCustomer} cancelHref="/customers" submitLabel={t("form.create")} />
    </div>
  );
}
