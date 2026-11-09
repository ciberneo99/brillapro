import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
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
      {sp.saved && <Alert tone="success">{t("saved")}</Alert>}

      {list.length === 0 && <Card className="text-center text-sm text-muted">{t("empty")}</Card>}
      {list.map((e) => (
        <Card key={e.id} accent={e.is_active ? "teal" : undefined} className={e.is_active ? "" : "opacity-70"}>
          <form action={updateEmployee.bind(null, e.id)} className="grid gap-3 sm:grid-cols-3">
            <Field label={t("name")} htmlFor={`n-${e.id}`}><SmartTextInput id={`n-${e.id}`} name="full_name" mode="name" defaultValue={e.full_name} required maxLength={120} /></Field>
            <Field label={t("phone")} htmlFor={`p-${e.id}`}><PhoneInput id={`p-${e.id}`} name="phone" defaultValue={e.phone ?? ""} /></Field>
            <Field label={t("email")} htmlFor={`e-${e.id}`}><EmailInput id={`e-${e.id}`} name="email" defaultValue={e.email ?? ""} /></Field>
            <div className="sm:col-span-3">
              <Field label={t("login")} htmlFor={`u-${e.id}`} hint={t("loginHelp")}>
                <Select id={`u-${e.id}`} name="user_id" defaultValue={e.user_id ?? ""} disabled={!canEdit}>
                  <option value="">{t("noLogin")}</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.label}</option>)}
                </Select>
              </Field>
            </div>
            <div className="sm:col-span-3"><Input name="notes" defaultValue={e.notes ?? ""} maxLength={1000} placeholder={t("notes")} aria-label={t("notes")} disabled={!canEdit} /></div>
            {canEdit && <div className="sm:col-span-3"><Button type="submit" variant="secondary">{t("save")}</Button></div>}
          </form>
          {canEdit && (
            <form action={setEmployeeActive.bind(null, e.id, !e.is_active)} className="mt-2">
              <Button type="submit" variant="ghost">{e.is_active ? t("deactivate") : t("activate")}</Button>
            </form>
          )}
        </Card>
      ))}

      {canEdit && (
        <Card accent="green">
          <h2 className="mb-3 text-base font-semibold">{t("add")}</h2>
          <form action={addEmployee} className="grid gap-3 sm:grid-cols-3">
            <Field label={t("name")} htmlFor="n-new"><SmartTextInput id="n-new" name="full_name" mode="name" required maxLength={120} /></Field>
            <Field label={t("phone")} htmlFor="p-new"><PhoneInput id="p-new" name="phone" /></Field>
            <Field label={t("email")} htmlFor="e-new"><EmailInput id="e-new" name="email" /></Field>
            <div className="sm:col-span-3"><Input name="notes" maxLength={1000} placeholder={t("notes")} aria-label={t("notes")} /></div>
            <div className="sm:col-span-3"><Button type="submit">{t("addButton")}</Button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
