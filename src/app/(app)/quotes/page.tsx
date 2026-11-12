import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, cn } from "@/components/ui";
import { QuoteCalculator } from "@/components/quotes/QuoteCalculator";
import { QuoteStatusBadge } from "@/components/quotes/QuoteStatusBadge";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney, quoteNumber } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { displayName } from "@/modules/customers/schema";
import { getQuoteSettings, listQuotes, PAGE_SIZE } from "@/modules/quotes/queries";
import { QUOTE_STATUSES } from "@/modules/quotes/schema";

export const metadata = { title: "Quotes" };
type SP = { status?: string; page?: string };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "quotes:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("quotes");
  const [{ rows, total, page }, qs] = await Promise.all([
    listQuotes({ status: sp.status, page: Number(sp.page) || 1 }),
    getQuoteSettings(ctx.tenant.id),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const active = (QUOTE_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const href = (o: { status?: string; page?: string }) => {
    const p = new URLSearchParams();
    if (o.status) p.set("status", o.status);
    if (o.page) p.set("page", o.page);
    const q = p.toString();
    return q ? `/quotes?${q}` : "/quotes";
  };
  const pill = (on: boolean) => cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:bg-surface-2");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex gap-2">
          {can(ctx.role, "settings:read") && (
            <Link href="/settings/quotes" className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">{t("settings")}</Link>
          )}
          {can(ctx.role, "quotes:write") && <QuoteCalculator currency={ctx.settings.currency} />}
          {can(ctx.role, "quotes:write") && (
            <Link href="/quotes/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover">{t("new")}</Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={href({})} className={pill(!active)}>{t("all")}</Link>
        {QUOTE_STATUSES.map((s) => <Link key={s} href={href({ status: s })} className={pill(active === s)}>{t(`status.${s}`)}</Link>)}
      </div>

      {rows.length === 0 ? (
        <Card className="text-center"><p className="font-medium">{t("empty")}</p><p className="mt-1 text-sm text-muted">{t("emptyBody")}</p></Card>
      ) : (
        <Card accent="violet" className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase text-muted">
              <tr><th className="p-3">{t("number")}</th><th className="p-3">{t("customer")}</th><th className="p-3">{t("expires")}</th><th className="p-3">{t("statusLabel")}</th><th className="p-3 text-right">{t("total")}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <td className="p-3"><Link href={`/quotes/${r.id}`} className="font-medium text-primary hover:underline">{quoteNumber(qs.quote_prefix, r.number)}</Link></td>
                  <td className="p-3">{displayName(r)}{r.title && <span className="block text-xs text-muted">{r.title}</span>}</td>
                  <td className="p-3">{formatDateOnly(r.expires_on, ctx.settings.date_format)}</td>
                  <td className="p-3"><QuoteStatusBadge status={r.display_status} /></td>
                  <td className="p-3 text-right font-medium">{r.total_cents == null ? "—" : formatMoney(r.total_cents, ctx.settings.currency)}</td>
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
            {page > 1 && <Link className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2" href={href({ status: active, page: String(page - 1) })}>{t("prev")}</Link>}
            {page < pages && <Link className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2" href={href({ status: active, page: String(page + 1) })}>{t("next")}</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
