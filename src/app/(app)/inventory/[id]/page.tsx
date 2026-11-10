import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { ItemFields } from "@/components/inventory/ItemFields";
import { DatePicker } from "@/components/ui/DatePicker";
import { todayIso } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { recentJobs } from "@/modules/expenses/queries";
import { addMovement, setItemActive, updateItem } from "@/modules/inventory/actions";
import { getItem, listMovements } from "@/modules/inventory/queries";
import { MOVEMENT_KINDS } from "@/modules/inventory/schema";

export const metadata = { title: "Inventory item" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireContext();
  if (!can(ctx.role, "inventory:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("inventory");
  const item = await getItem(id);
  if (!item) notFound();
  const canWrite = can(ctx.role, "inventory:write");
  const [movements, jobs] = await Promise.all([listMovements(id), canWrite ? recentJobs() : Promise.resolve([])]);
  const err = sp.error === "stock" ? "stockError" : sp.error === "taken" ? "nameTaken" : "invalid";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/inventory" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{item.name}</h1>
        <p className="mt-1 text-sm">
          {t("onHand")}: <strong>{item.on_hand} {item.unit}</strong>
          {item.is_low && <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">{t("low")}</span>}
        </p>
      </div>
      {sp.error && <Alert>{t(err)}</Alert>}
      {sp.saved && <Alert tone="success">{t("saved")}</Alert>}

      {canWrite && item.is_active && (
        <Card accent="teal">
          <h2 className="mb-3 text-base font-semibold">{t("addMovement")}</h2>
          <form action={addMovement.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
            <Field label={t("kind")} htmlFor="kind">
              <Select id="kind" name="kind" defaultValue="purchase">
                {MOVEMENT_KINDS.map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("quantity")} htmlFor="quantity"><Input id="quantity" name="quantity" inputMode="decimal" required /></Field>
            <Field label={t("date")} htmlFor="movement_date"><DatePicker id="movement_date" name="movement_date" defaultValue={todayIso(ctx.settings.timezone)} dateFormat={ctx.settings.date_format} /></Field>
            <Field label={t("job")} htmlFor="job_id" hint={t("jobHint")}>
              <Select id="job_id" name="job_id" defaultValue="">
                <option value="">—</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.scheduled_date} · {j.customer_name} · {j.title}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2"><Field label={t("note")} htmlFor="note"><Input id="note" name="note" maxLength={300} /></Field></div>
            <div className="sm:col-span-2"><Button type="submit">{t("record")}</Button></div>
          </form>
        </Card>
      )}

      <Card accent="blue" className="p-0">
        <h2 className="p-4 pb-2 text-base font-semibold">{t("history")}</h2>
        {movements.length === 0 ? <p className="p-4 pt-0 text-sm text-muted">{t("noHistory")}</p> : (
          <ul className="divide-y divide-line text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  {formatDateOnly(m.movement_date, ctx.settings.date_format)} · {t(`movement.${m.kind}`)}
                  {m.job_title && <span className="text-muted"> · {m.job_title}</span>}
                  {m.note && <span className="text-muted"> — {m.note}</span>}
                </span>
                <span className={m.quantity > 0 ? "font-medium text-success" : "font-medium text-danger"}>{m.quantity > 0 ? "+" : ""}{m.quantity} {item.unit}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card accent="green">
        <h2 className="mb-3 text-base font-semibold">{t("details")}</h2>
        <form action={updateItem.bind(null, id)} className="space-y-4">
          <fieldset disabled={!canWrite} className="space-y-4"><ItemFields value={item} currency={ctx.settings.currency} /></fieldset>
          {canWrite && <Button type="submit">{t("save")}</Button>}
        </form>
      </Card>

      {canWrite && (
        <form action={setItemActive.bind(null, id, !item.is_active)}>
          <Button type="submit" variant="ghost">{item.is_active ? t("deactivate") : t("activate")}</Button>
        </form>
      )}
    </div>
  );
}
