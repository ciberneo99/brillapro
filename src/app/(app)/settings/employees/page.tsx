import Link from "next/link";
import { EmployeeCard } from "@/components/employees/EmployeeCard";
import { AddEmployeeCard } from "@/components/employees/AddEmployeeCard";
import { SavedToast } from "@/components/ui/SavedToast";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Card } from "@/components/ui";
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
        {canEdit && <AddEmployeeCard key={list.length} action={addEmployee} />}
        {list.map((e) => (
          <EmployeeCard
            key={[e.id, e.full_name, e.phone, e.phone_2, e.email, e.address, e.city, e.state, e.zip_code, e.user_id, e.notes, e.is_active].join("|")}
            employee={e} members={members} canEdit={canEdit}
            saveAction={updateEmployee.bind(null, e.id)} activeAction={setEmployeeActive.bind(null, e.id, !e.is_active)}
          />
        ))}
      </div>
    </div>
  );
}
