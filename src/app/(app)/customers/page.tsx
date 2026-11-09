import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { Button, Card, Input, Select, cn } from "@/components/ui";
import { StatusBadge } from "@/components/customers/StatusBadge";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { listCustomers, SORTS } from "@/modules/customers/queries";
import { displayName, STATUSES } from "@/modules/customers/schema";

export const metadata = { title: "Customers" };

type SP = { q?: string; status?: string; sort?: string; page?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "customers:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("customers");
  const format = await getFormatter();
  const { rows, total, page, pages, sort, status, q } = await listCustomers({ ...sp, page: Number(sp.page) || 1 });

  const href = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { q: q || undefined, status: status ?? undefined, sort: sort !== "newest" ? sort : undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/customers?${s}` : "/customers";
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("count", { count: total })}</p>
        </div>
        {can(ctx.role, "customers:write") && (
          <Link href="/customers/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover">
            <Plus className="h-4 w-4" aria-hidden /> {t("new")}
          </Link>
        )}
      </header>

      <nav aria-label={t("status.prospect")} className="flex flex-wrap gap-2">
        {[null, ...STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={href({ status: s ?? undefined, page: undefined })}
            aria-current={status === s ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", status === s ? "border-primary bg-primary-soft text-primary" : "border-line text-muted hover:bg-surface-2")}
          >
            {s ? t(`status.${s}`) : t("all")}
          </Link>
        ))}
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-3">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="sr-only">{t("search")}</label>
          <Input id="q" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} type="search" />
        </div>
        <div>
          <label htmlFor="sort" className="sr-only">{t("sortLabel")}</label>
          <Select id="sort" name="sort" defaultValue={sort}>
            {SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
          </Select>
        </div>
        <Button type="submit" variant="secondary">{t("search")}</Button>
      </form>

      {rows.length === 0 ? (
        <Card className="text-center">
          <p className="font-medium">{q || status ? t("empty.filtered") : t("empty.title")}</p>
          {!q && !status && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t("empty.body")}</p>}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">{t("columns.name")}</th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">{t("columns.contact")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("columns.status")}</th>
                <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">{t("columns.added")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-primary hover:underline">{displayName(c) || t("unnamed")}</Link>
                    {c.company_name && displayName(c) !== c.company_name && <p className="text-xs text-muted">{c.company_name}</p>}
                  </td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">
                    <p>{c.email ?? "—"}</p>
                    <p className="text-xs">{c.phone ?? ""}</p>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">{format.dateTime(new Date(c.created_at), { dateStyle: "medium" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">{t("page", { page, pages })}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2" href={href({ page: String(page - 1) })}>{t("prev")}</Link>}
            {page < pages && <Link className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2" href={href({ page: String(page + 1) })}>{t("next")}</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
