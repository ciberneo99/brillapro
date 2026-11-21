import Link from "next/link";
import { ClickableRow } from "@/components/ClickableRow";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  AlertCircle, Bath, BedDouble, CalendarClock, DollarSign, FileText, Filter, Home, Mail, MapPin, PawPrint, Phone, Plus, Ruler, Search,
} from "lucide-react";
import { CustomerMenu } from "@/components/customers/CustomerMenu";
import { removeCustomerFromList } from "@/modules/customers/actions";
import { MoreActions } from "@/components/customers/MoreActions";
import { StatusBadge } from "@/components/customers/StatusBadge";
import { Stars } from "@/components/customers/Stars";
import { TimeBar } from "@/components/customers/TimeBar";
import { Alert, Button, Select, cn } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { mapsUrl } from "@/lib/maps";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { listCustomers, RATINGS, SORTS, SQFT_RANGES } from "@/modules/customers/queries";
import { getCustomerExtras, getCustomersSummary, type CustomerExtras } from "@/modules/customers/list-extras";
import { displayName, FREQUENCIES, PROPERTY_TYPES, STATUSES, type CustomerRow } from "@/modules/customers/schema";
import { SavedToast } from "@/components/ui/SavedToast";

export const metadata = { title: "Customers" };

type SP = { q?: string; status?: string; sort?: string; page?: string; type?: string; freq?: string; rating?: string; sqft?: string; removed?: string; removeError?: string };

const addressLine = (c: CustomerRow) => [c.service_address, [c.city, [c.state, c.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireContext();
  if (!can(ctx.role, "customers:read")) redirect("/dashboard");
  const sp = await searchParams;
  const t = await getTranslations("customers");
  const tf = await getTranslations("customers.frequency");
  const tp = await getTranslations("customers.propertyType");
  const { rows, total, page, pages, sort, status, q, type, freq, rating, sqft } = await listCustomers({ ...sp, page: Number(sp.page) || 1 });
  const hasAdv = Boolean(status || type || freq || rating || sqft || sort !== "newest");
  const filtered = Boolean(q || status || type || freq || rating || sqft);
  const sqftLabel = (k: string) => (k.endsWith("+") ? `${k.slice(0, -1).replace(/\B(?=(\d{3})+$)/g, ",")}+` : k.split("-").map((n) => Number(n).toLocaleString("en-US")).join("–")) + ` ${t("list.sqft")}`;

  const canMoney = can(ctx.role, "invoices:read");
  const canWrite = can(ctx.role, "customers:write");
  const [extras, summary] = await Promise.all([getCustomerExtras(rows.map((r) => r.id)), canMoney ? getCustomersSummary() : Promise.resolve(null)]);
  const cur = ctx.settings.currency;
  const fmt = (c: number) => formatMoney(c, cur);
  const df = ctx.settings.date_format;

  const href = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { q: q || undefined, status: status ?? undefined, sort: sort !== "newest" ? sort : undefined, type: type ?? undefined, freq: freq ?? undefined, rating: rating ?? undefined, sqft: sqft ?? undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/customers?${s}` : "/customers";
  };

  const menuLabels = { menu: t("list.menu"), view: t("list.view"), edit: t("list.edit"), newQuote: t("list.newQuote"), newJob: t("list.newJob"), remove: t("list.delete"), confirmRemove: t("list.confirmDelete") };
  const menu = (c: CustomerRow) => (
    <CustomerMenu
      id={c.id} labels={menuLabels} canEdit={canWrite} canQuote={can(ctx.role, "quotes:write")} canJob={can(ctx.role, "jobs:write")}
      removeAction={canWrite && c.status !== "archived" ? removeCustomerFromList.bind(null, c.id, href({})) : undefined}
    />
  );

  const property = (c: CustomerRow) => (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap">
        {c.bedrooms != null && <span className="flex items-center gap-1" title={t("list.beds")}><BedDouble className="h-4 w-4 text-primary" aria-hidden />{c.bedrooms}</span>}
        {c.bathrooms != null && <span className="flex items-center gap-1" title={t("list.baths")}><Bath className="h-4 w-4 text-[var(--c-blue)]" aria-hidden />{c.bathrooms}</span>}
        {c.square_footage != null && <span className="flex items-center gap-1" title={t("list.area")}><Ruler className="h-4 w-4 text-[var(--c-violet)]" aria-hidden />{c.square_footage.toLocaleString("en-US")} {t("list.sqft")}</span>}
        {c.bedrooms == null && c.bathrooms == null && c.square_footage == null && <span className="text-muted">—</span>}
      </div>
      {c.pets && <p className="flex items-center gap-1 text-muted"><PawPrint className="h-4 w-4 text-[var(--c-amber)]" aria-hidden />{c.pets}</p>}
    </div>
  );

  const owes = (x: CustomerExtras | undefined) =>
    x && x.outstanding_cents > 0 ? (
      <span className={cn("font-semibold", x.overdue_cents > 0 ? "text-danger" : "")}>{fmt(x.outstanding_cents)}</span>
    ) : <span className="text-muted">—</span>;

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-5">
      <input id="adv-toggle" type="checkbox" defaultChecked={hasAdv} aria-label={t("list.advanced")} className="peer sr-only" />
      {sp.removed && <SavedToast param="removed">{t("list.removed")}</SavedToast>}
      {sp.removeError && <Alert>{t("list.removeError")}</Alert>}
      <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 0 }}>
        <form method="get" role="search" className="relative min-w-56 flex-1">
          {status && <input type="hidden" name="status" value={status} />}
          {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
          {type && <input type="hidden" name="type" value={type} />}
          {freq && <input type="hidden" name="freq" value={freq} />}
          {rating && <input type="hidden" name="rating" value={rating} />}
          {sqft && <input type="hidden" name="sqft" value={sqft} />}
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="q" name="q" type="search" defaultValue={q} placeholder={t("searchPlaceholder")} aria-label={t("search")} maxLength={80}
            className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm placeholder:text-muted" />
        </form>
        {canWrite && (
          <Link href="/customers/new" className="bp-fx bp-fx-solid inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
            <Plus className="h-4 w-4" aria-hidden /> {t("list.newClient")}
          </Link>
        )}
        <label htmlFor="adv-toggle" className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">
          <Filter className="h-4 w-4" aria-hidden /> {t("list.advanced")}{hasAdv && <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />}
        </label>
        <MoreActions canImport={canWrite} />
      </div>

      {summary && (
        <section className="grid gap-4 md:grid-cols-3" aria-label={t("title")}>
          <Link href="/invoices" className="rounded-2xl border border-[#f0c4c4] bg-[#fbeaea] p-5 text-[#7a1d1d] dark:border-[#5a2a2a] dark:bg-[#2c1717] dark:text-[#f5c6c6]">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#d92d2d] text-white"><AlertCircle className="h-6 w-6" aria-hidden /></span>
              <div><p className="text-sm">{t("summary.overdue")}</p><p className="text-2xl font-extrabold tracking-tight">{fmt(summary.overdue_cents)}</p></div>
            </div>
            <p className="mt-3 text-sm font-medium opacity-80">{t("summary.viewInvoices")} →</p>
          </Link>
          <Link href="/invoices" className="rounded-2xl border border-[#efd3b0] bg-[#fbf0e1] p-5 text-[#7a4210] dark:border-[#5a4020] dark:bg-[#2b2010] dark:text-[#f2d3a8]">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e8710a] text-white"><DollarSign className="h-6 w-6" aria-hidden /></span>
              <div><p className="text-sm">{t("summary.outstanding")}</p><p className="text-2xl font-extrabold tracking-tight">{fmt(summary.outstanding_cents)}</p></div>
            </div>
            <p className="mt-3 text-sm font-medium opacity-80">{t("summary.viewInvoices")} →</p>
          </Link>
          <Link href="/quotes" className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg"><FileText className="h-6 w-6" aria-hidden /></span>
              <div><p className="text-sm text-muted">{t("summary.drafts")}</p><p className="text-2xl font-extrabold tracking-tight">{summary.draft_quotes}</p></div>
            </div>
            <p className="mt-3 text-sm font-medium text-primary">{t("summary.viewQuotes")} →</p>
          </Link>
        </section>
      )}

        <form method="get" className="hidden space-y-4 rounded-2xl border border-line bg-surface p-4 shadow-card peer-checked:block">
          {q && <input type="hidden" name="q" value={q} />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1.5">
              <label htmlFor="adv-status" className="block text-sm font-medium">{t("list.status")}</label>
              <Select id="adv-status" name="status" defaultValue={status ?? ""}>
                <option value="">{t("all")}</option>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="adv-type" className="block text-sm font-medium">{t("list.propertyType")}</label>
              <Select id="adv-type" name="type" defaultValue={type ?? ""}>
                <option value="">{t("all")}</option>
                {PROPERTY_TYPES.map((p) => <option key={p} value={p}>{tp(p)}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="adv-freq" className="block text-sm font-medium">{t("list.frequency")}</label>
              <Select id="adv-freq" name="freq" defaultValue={freq ?? ""}>
                <option value="">{t("all")}</option>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{tf(f)}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="adv-rating" className="block text-sm font-medium">{t("list.rating")}</label>
              <Select id="adv-rating" name="rating" defaultValue={rating ?? ""}>
                <option value="">{t("all")}</option>
                {RATINGS.map((r) => <option key={r} value={r}>{r === "none" ? t("list.unrated") : t("list.starsOption", { count: Number(r) })}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="adv-sqft" className="block text-sm font-medium">{t("list.sqftFilter")}</label>
              <Select id="adv-sqft" name="sqft" defaultValue={sqft ?? ""}>
                <option value="">{t("all")}</option>
                {Object.keys(SQFT_RANGES).map((k) => <option key={k} value={k}>{sqftLabel(k)}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="adv-sort" className="block text-sm font-medium">{t("list.sort")}</label>
              <Select id="adv-sort" name="sort" defaultValue={sort}>
                {SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit">{t("list.apply")}</Button>
            <Link href="/customers" className="text-sm text-muted hover:text-fg">{t("list.clear")}</Link>
          </div>
        </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <p className="font-medium">{filtered ? t("empty.filtered") : t("empty.title")}</p>
          {!filtered && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t("empty.body")}</p>}
        </div>
      ) : (
        <>
          {/* Desktop: full table */}
          <div className="hidden rounded-2xl border border-line bg-surface shadow-card xl:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  {(["name", "contact", "property", "time", "status", "frequency", "rating", "outstanding", "actions"] as const).map((k) => (
                    <th key={k} scope="col" className={cn("px-2.5 py-3 font-semibold whitespace-nowrap", k === "actions" && "text-right")}>{t(`columns.${k}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => {
                  const x = extras.get(c.id);
                  const addr = addressLine(c);
                  return (
                    <ClickableRow key={c.id} href={`/customers/${c.id}`} className="align-top hover:bg-surface-2/60">
                      <td className="min-w-48 max-w-72 px-2.5 py-4">
                        <Link href={`/customers/${c.id}`} className="text-base font-semibold hover:text-primary">{displayName(c) || t("unnamed")}</Link>
                        {c.company_name && displayName(c) !== c.company_name && <p className="text-xs text-muted">{c.company_name}</p>}
                        {addr && <a href={mapsUrl(addr)} target="_blank" rel="noopener noreferrer" title={t("list.openMap")} className="mt-1 flex gap-1 text-xs text-primary hover:underline"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{addr}<span className="sr-only"> ({t("list.openMap")})</span></a>}
                      </td>
                      <td className="px-2.5 py-4 text-muted">
                        {c.email && <p className="flex items-center gap-1.5"><Mail className="h-4 w-4 shrink-0" aria-hidden /><span className="max-w-32 truncate">{c.email}</span></p>}
                        {c.phone && <p className="mt-1 flex items-center gap-1.5"><Phone className="h-4 w-4 shrink-0" aria-hidden />{c.phone}</p>}
                        {!c.email && !c.phone && "—"}
                      </td>
                      <td className="min-w-44 px-2.5 py-4">{property(c)}</td>
                      <td className="px-2.5 py-4"><TimeBar x={x} dateFormat={df} /></td>
                      <td className="px-2.5 py-4">
                        <StatusBadge status={c.status} />
                        {c.property_type && <p className="mt-1.5 flex items-center gap-1 text-xs text-muted"><Home className="h-3.5 w-3.5" aria-hidden />{tp(c.property_type as never)}</p>}
                      </td>
                      <td className="px-2.5 py-4">
                        {c.cleaning_frequency ? <span className="flex max-w-32 items-start gap-1.5"><CalendarClock className="h-4 w-4 text-muted" aria-hidden />{tf(c.cleaning_frequency as never)}</span> : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-2.5 py-4"><Stars value={c.rating} label={c.rating ? t("list.stars", { count: c.rating }) : t("list.noRating")} /></td>
                      <td className="px-2.5 py-4">{owes(x)}</td>
                      <td className="px-2.5 py-4 text-right">{menu(c)}</td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phone and tablet: one card per customer */}
          <ul className="space-y-3 xl:hidden">
            {rows.map((c) => {
              const x = extras.get(c.id);
              const addr = addressLine(c);
              return (
                <ClickableRow as="li" key={c.id} href={`/customers/${c.id}`} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/customers/${c.id}`} className="text-base font-semibold hover:text-primary">{displayName(c) || t("unnamed")}</Link>
                      {addr && <a href={mapsUrl(addr)} target="_blank" rel="noopener noreferrer" title={t("list.openMap")} className="mt-0.5 flex gap-1 text-xs text-primary hover:underline"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{addr}<span className="sr-only"> ({t("list.openMap")})</span></a>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1"><StatusBadge status={c.status} />{menu(c)}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div className="space-y-1 text-muted">
                      {c.email && <p className="flex items-center gap-1.5"><Mail className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{c.email}</span></p>}
                      {c.phone && <p className="flex items-center gap-1.5"><Phone className="h-4 w-4 shrink-0" aria-hidden />{c.phone}</p>}
                    </div>
                    {property(c)}
                    <TimeBar x={x} dateFormat={df} />
                    <div className="space-y-1.5">
                      {c.cleaning_frequency && <p className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-muted" aria-hidden />{tf(c.cleaning_frequency as never)}</p>}
                      <Stars value={c.rating} label={c.rating ? t("list.stars", { count: c.rating }) : t("list.noRating")} />
                      <p>{owes(x)}</p>
                    </div>
                  </div>
                </ClickableRow>
              );
            })}
          </ul>
        </>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">{t("page", { page, pages })} · {t("count", { count: total })}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="bp-fx bp-fx-nobar rounded-lg border border-line px-3 py-1.5 hover:border-primary hover:bg-primary-soft" href={href({ page: String(page - 1) })}>{t("prev")}</Link>}
            {page < pages && <Link className="bp-fx bp-fx-nobar rounded-lg border border-line px-3 py-1.5 hover:border-primary hover:bg-primary-soft" href={href({ page: String(page + 1) })}>{t("next")}</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
