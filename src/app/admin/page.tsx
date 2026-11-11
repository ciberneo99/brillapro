import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PreferenceControls } from "@/components/PreferenceControls";
import { Alert, Button, Card, Input, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getTheme } from "@/lib/theme";
import { extendTrial, setCompanyPlan, setCompanyStatus } from "@/modules/admin/actions";

type Company = {
  id: string; name: string; created_at: string; status: string; plan_id: string | null; sub_status: string | null;
  trial_ends_at: string | null; users: number; customers: number; jobs: number; invoices: number; owner_email: string | null;
};

export const metadata = { title: "Platform admin", robots: { index: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (isAdmin !== true) notFound(); // signed-in non-admins and visitors learn nothing about this page

  const sp = await searchParams;
  const t = await getTranslations("admin");
  const theme = await getTheme();
  const { data } = await supabase.rpc("platform_companies");
  const rows = (data ?? []) as Company[];
  const active = rows.filter((r) => r.status === "active").length;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("intro")}</p>
        </div>
        <PreferenceControls compact theme={theme} />
      </div>
      {sp.error && <Alert>{t("error")}</Alert>}
      {sp.saved && <Alert tone="success">{t("saved")}</Alert>}
      <p className="text-sm text-muted">{t("summary", { total: rows.length, active })}</p>

      {rows.map((c) => (
        <Card key={c.id} accent={c.status === "active" ? "teal" : "rose"} className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">{c.name}</h2>
              <p className="text-sm text-muted">{c.owner_email ?? "—"} · {new Date(c.created_at).toLocaleDateString("en-US")}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-surface-2 px-3 py-1">{c.plan_id} · {c.sub_status}</span>
              {c.status === "suspended" && <span className="rounded-full bg-danger-soft px-3 py-1 text-danger">{t("suspendedBadge")}</span>}
            </div>
          </div>
          <p className="text-sm text-muted">
            {t("counts", { users: c.users, customers: c.customers, jobs: c.jobs, invoices: c.invoices })}
            {c.trial_ends_at && c.sub_status === "trialing" && ` · ${t("trialUntil", { date: new Date(c.trial_ends_at).toLocaleDateString("en-US") })}`}
          </p>

          <div className="grid gap-3 lg:grid-cols-3">
            <form action={setCompanyPlan.bind(null, c.id)} className="flex flex-wrap items-center gap-2">
              <Select name="plan" defaultValue={c.plan_id ?? "trial"} aria-label={t("plan")} className="w-32">
                {["trial", "starter", "pro"].map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
              <Select name="status" defaultValue={c.sub_status ?? "trialing"} aria-label={t("subStatus")} className="w-32">
                {["trialing", "active", "past_due", "canceled", "suspended"].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Button type="submit" variant="secondary">{t("savePlan")}</Button>
            </form>
            <form action={extendTrial.bind(null, c.id)} className="flex items-center gap-2">
              <Input name="days" type="number" min={1} max={90} defaultValue={7} aria-label={t("days")} className="w-20" />
              <Button type="submit" variant="secondary">{t("extend")}</Button>
            </form>
            <form action={setCompanyStatus.bind(null, c.id, c.status === "active" ? "suspended" : "active")} className="flex items-center gap-2">
              <Input name="reason" maxLength={500} placeholder={t("reason")} aria-label={t("reason")} />
              <Button type="submit" variant={c.status === "active" ? "danger" : "secondary"}>{c.status === "active" ? t("suspend") : t("reactivate")}</Button>
            </form>
          </div>
        </Card>
      ))}
    </main>
  );
}
