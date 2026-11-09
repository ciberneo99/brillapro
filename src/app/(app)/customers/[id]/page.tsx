import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft, Pencil } from "lucide-react";
import { Alert, Button, Card } from "@/components/ui";
import { StatusBadge } from "@/components/customers/StatusBadge";
import { can } from "@/lib/permissions";
import { formatDateOnly, formatTimestamp } from "@/lib/dates";
import { requireContext } from "@/lib/session";
import { changeCustomerStatus, convertCustomer } from "@/modules/customers/actions";
import { getCustomer, getCustomerEvents, hasDuplicateEmail } from "@/modules/customers/queries";
import { centsToInput, displayName } from "@/modules/customers/schema";

export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  if (!can(ctx.role, "customers:read")) redirect("/dashboard");
  const c = await getCustomer(id);
  if (!c) notFound();

  const [t, format, events, duplicate] = await Promise.all([
    getTranslations("customers"),
    getFormatter(),
    getCustomerEvents(id),
    hasDuplicateEmail(id, c.email),
  ]);
  const canWrite = can(ctx.role, "customers:write");
  const date = (d: string) => formatTimestamp(d, ctx.settings.date_format, ctx.settings.timezone);
  const dash = t("profile.none");

  const rows: [string, string | null][] = [
    [t("form.email"), c.email], [t("form.phone"), c.phone], [t("form.secondaryPhone"), c.secondary_phone],
    [t("form.serviceAddress"), [c.service_address, c.city, c.state, c.zip_code].filter(Boolean).join(", ") || null],
    [t("form.billingAddress"), c.billing_address],
    [t("form.propertyType"), c.property_type ? t(`propertyType.${c.property_type}` as never) : null],
    [t("form.squareFootage"), c.square_footage ? format.number(c.square_footage) : null],
    [t("form.bedrooms"), c.bedrooms?.toString() ?? null], [t("form.bathrooms"), c.bathrooms?.toString() ?? null],
    [t("form.frequency"), c.cleaning_frequency ? t(`frequency.${c.cleaning_frequency}` as never) : null],
    [t("form.preferredService"), c.preferred_service],
    [t("form.estimatedPrice"), c.estimated_price_cents != null ? format.number(Number(centsToInput(c.estimated_price_cents)), { style: "currency", currency: ctx.settings.currency }) : null],
    [t("form.pets"), c.pets], [t("form.accessInstructions"), c.access_instructions],
    [t("form.specialInstructions"), c.special_instructions], [t("form.notes"), c.notes],
  ];

  const eventText = (e: (typeof events)[number]) =>
    e.type === "status_changed"
      ? t("profile.events.status_changed", { from: t(`status.${e.metadata.from}` as never), to: t(`status.${e.metadata.to}` as never) })
      : t(`profile.events.${e.type}` as never);

  return (
    <div className="space-y-6">
      <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("profile.back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{displayName(c) || t("unnamed")}</h1>
            <StatusBadge status={c.status} />
          </div>
          {c.company_name && displayName(c) !== c.company_name && <p className="mt-1 text-sm text-muted">{c.company_name}</p>}
          <p className="mt-1 text-xs text-muted">
            {t("profile.source." + c.source)} · {t("profile.addedOn", { date: date(c.created_at) })}
            {c.customer_since && ` · ${t("profile.since", { date: formatDateOnly(c.customer_since, ctx.settings.date_format) })}`}
          </p>
        </div>

        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/customers/${id}/edit`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">
              <Pencil className="h-4 w-4" aria-hidden /> {t("profile.edit")}
            </Link>
            {c.status === "prospect" && (
              <form action={convertCustomer.bind(null, id)}><Button type="submit">{t("profile.convert")}</Button></form>
            )}
            {c.status === "active" && (
              <form action={changeCustomerStatus.bind(null, id, "inactive")}><Button type="submit" variant="secondary">{t("profile.markInactive")}</Button></form>
            )}
            {(c.status === "inactive" || c.status === "archived") && (
              <form action={changeCustomerStatus.bind(null, id, "restore")}>
                <Button type="submit" variant="secondary">{c.status === "archived" ? t("profile.restore") : t("profile.reactivate")}</Button>
              </form>
            )}
            {c.status !== "archived" && (
              <form action={changeCustomerStatus.bind(null, id, "archive")}><Button type="submit" variant="ghost">{t("profile.archive")}</Button></form>
            )}
          </div>
        )}
      </header>

      {duplicate && <Alert>{t("profile.duplicate")}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold">{t("profile.details")}</h2>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="whitespace-pre-wrap break-words text-sm">{value || dash}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold">{t("profile.history")}</h2>
          <ol className="space-y-4">
            {events.map((e) => (
              <li key={e.id} className="border-l-2 border-line pl-3">
                <p className="text-sm">{eventText(e)}</p>
                <p className="text-xs text-muted">
                  {date(e.created_at)}{e.actor_name ? ` · ${e.actor_name}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {([["quotes", 3], ["jobs", 4], ["invoices", 5], ["payments", 5]] as const).map(([key, phase]) => (
          <Card key={key}>
            <h2 className="text-sm font-semibold">{t(`profile.related.${key}`)}</h2>
            <p className="mt-1 text-xs text-muted">{t("profile.related.availableIn", { phase })}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
