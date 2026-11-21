import Link from "next/link";
import { UserPlus } from "lucide-react";
import { EmployeeCard } from "@/components/employees/EmployeeCard";
import { SavedToast } from "@/components/ui/SavedToast";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { EmailInput } from "@/components/ui/EmailInput";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { SmartTextInput } from "@/components/ui/SmartTextInput";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { addEmployee, setEmployeeActive, updateEmployee } from "@/modules/employees/actions";
import { listEmployees } from "@/modules/employees/module";
import { listMembers } from "@/modules/notebook/queries";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "employees:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("employees");
  const canEdit = can(ctx.role, "employees:write");
  const [list, members] = await Promise.all([listEmployees(), listMembers(ctx.tenant.id)]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </div>
      {sp.error && <Alert>{t("invalid")}</Alert>}
      {sp.saved && <SavedToast key={sp.saved}>{t("saved")}</SavedToast>}

      {list.length === 0 && !canEdit && <Card className="text-center text-sm text-muted">{t("empty")}</Card>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canEdit && (
          <div className="add-card flex flex-col rounded-xl p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg"><UserPlus className="h-6 w-6" aria-hidden /></span>
              <h2 className="text-base font-semibold">{t("add")}</h2>
            </div>
            <form key={list.length} action={addEmployee} className="flex flex-1 flex-col gap-3">
              <Field label={t("name")} htmlFor="n-new"><SmartTextInput id="n-new" name="full_name" mode="name" required maxLength={120} /></Field>
              <Field label={t("phone")} htmlFor="p-new"><PhoneInput id="p-new" name="phone" /></Field>
              <Field label={t("email")} htmlFor="e-new"><EmailInput id="e-new" name="email" /></Field>
              <Input name="notes" maxLength={1000} placeholder={t("notes")} aria-label={t("notes")} />
              <div className="mt-auto pt-1"><Button type="submit" className="w-full">{t("addButton")}</Button></div>
            </form>
          </div>
        )}
        {list.map((e) => (
          <EmployeeCard
            key={[e.id, e.full_name, e.phone, e.email, e.user_id, e.notes, e.is_active].join("|")}
            employee={e} members={members} canEdit={canEdit}
            saveAction={updateEmployee.bind(null, e.id)} activeAction={setEmployeeActive.bind(null, e.id, !e.is_active)}
          />
        ))}
      </div>
    </div>
  );
}
