import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Input, Select, cn } from "@/components/ui";
import { DatePicker } from "@/components/ui/DatePicker";
import { todayIso } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { createTask, deleteTask, setTaskDone } from "@/modules/notebook/actions";
import { listMembers, listTasks, type Task } from "@/modules/notebook/queries";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "notebook:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("tasks");
  const fmt = ctx.settings.date_format;
  const today = todayIso(ctx.settings.timezone);
  const staff = can(ctx.role, "jobs:write");
  const [tasks, members] = await Promise.all([listTasks(), listMembers(ctx.tenant.id)]);
  const open = tasks.filter((x) => !x.is_done);
  const done = tasks.filter((x) => x.is_done);

  const row = (x: Task) => (
    <li key={x.id} className="flex items-start gap-3 py-3">
      <form action={setTaskDone.bind(null, x.id, !x.is_done)}>
        <button type="submit" aria-label={x.is_done ? t("reopen") : t("complete")}
          className={cn("mt-0.5 flex h-5 w-5 items-center justify-center rounded border text-xs", x.is_done ? "border-success bg-success text-primary-fg" : "border-line hover:border-primary")}>{x.is_done ? "✓" : ""}</button>
      </form>
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium", x.is_done && "text-muted line-through")}>{x.title}</p>
        {x.notes && <p className="text-sm text-muted">{x.notes}</p>}
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
          {x.due_date && <span className={cn(!x.is_done && x.due_date < today && "font-medium text-danger")}>{t("due")} {formatDateOnly(x.due_date, fmt)}{!x.is_done && x.due_date < today ? ` · ${t("overdue")}` : ""}</span>}
          {x.assigneeName && <span>{t("assignedTo")} {x.assigneeName}</span>}
        </p>
      </div>
      {(staff || x.created_by === ctx.userId) && (
        <form action={deleteTask.bind(null, x.id)}><button type="submit" className="text-xs text-danger hover:underline">{t("delete")}</button></form>
      )}
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/notebook" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {!staff && <p className="mt-1 text-sm text-muted">{t("employeeNote")}</p>}
      </div>
      {sp.error && <Alert>{t("invalid")}</Alert>}

      <Card accent="green">
        <form action={createTask} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Input name="title" required maxLength={200} placeholder={t("titlePlaceholder")} aria-label={t("titlePlaceholder")} /></div>
          <div className="sm:col-span-2"><Input name="notes" maxLength={2000} placeholder={t("notes")} aria-label={t("notes")} /></div>
          <Field label={t("dueDate")} htmlFor="due_date"><DatePicker id="due_date" name="due_date" dateFormat={fmt} /></Field>
          <Field label={t("assignTo")} htmlFor="assigned_to">
            <Select id="assigned_to" name="assigned_to" defaultValue="">
              <option value="">{t("nobody")}</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.label}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2"><Button type="submit">{t("add")}</Button></div>
        </form>
      </Card>

      <Card accent="blue">
        <h2 className="text-base font-semibold">{t("openTasks", { count: open.length })}</h2>
        {open.length === 0 ? <p className="mt-2 text-sm text-muted">{t("empty")}</p> : <ul className="divide-y divide-line">{open.map(row)}</ul>}
      </Card>

      {done.length > 0 && (
        <Card>
          <h2 className="text-base font-semibold">{t("doneTasks", { count: done.length })}</h2>
          <ul className="divide-y divide-line">{done.map(row)}</ul>
        </Card>
      )}
    </div>
  );
}
