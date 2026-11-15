"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Calculator, Check, Home, Sparkles, Star, Truck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, Button, Input, Select, cn } from "@/components/ui";
import { CustomerSearch } from "@/components/invoices/CustomerSearch";
import { formatMoney } from "@/lib/money";
import { createQuoteFromCalculator, loadCalculatorData, type CalculatorData } from "@/modules/pricing/actions";
import {
  calculate, CALC_PROPERTY_TYPES, CLEAN_TYPES, CONDITIONS, FREQUENCIES, PET_OPTIONS, type CalcInput, type CleanType, type Condition, type Frequency, type PetOption,
} from "@/modules/pricing/config";

const TYPE_ICONS = { standard: Home, deep: Sparkles, move: Truck, airbnb: Star } as const;
const num = (s: string) => (/^\d{1,6}$/.test(s.replace(/,/g, "").trim()) ? Number(s.replace(/,/g, "").trim()) : null);

/** The "Price calculator" button of the Quotes page and the window it opens. */
export function QuoteCalculator({ currency }: { currency: string }) {
  const t = useTranslations("pricing");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="bp-fx inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-primary hover:bg-primary-soft"
      >
        <Calculator className="h-4 w-4" aria-hidden /> {t("open")}
      </button>
      {open && <CalculatorDialog currency={currency} onClose={() => setOpen(false)} />}
    </>
  );
}

function CalculatorDialog({ currency, onClose }: { currency: string; onClose: () => void }) {
  const t = useTranslations("pricing");
  const ref = useRef<HTMLDialogElement | null>(null);
  const [data, setData] = useState<CalculatorData | null | undefined>(undefined); // undefined = loading, null = failed
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [sqft, setSqft] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [fullBaths, setFullBaths] = useState("");
  const [halfBaths, setHalfBaths] = useState("0");
  const [propertyType, setPropertyType] = useState<(typeof CALC_PROPERTY_TYPES)[number]>("house");
  const [pets, setPets] = useState<PetOption>("none");
  const [type, setType] = useState<CleanType>("standard");
  const [condition, setCondition] = useState<Condition>("well");
  const [frequency, setFrequency] = useState<Frequency>("one_time");
  const [addonIds, setAddonIds] = useState<string[]>([]);

  const money = (c: number) => formatMoney(c, currency);
  const rateText = (mills: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(mills / 1000);

  // Rates and clients are fetched when the window opens, so the Quotes list itself stays light.
  const loaded = useRef(false);
  const begin = (el: HTMLDialogElement | null) => {
    ref.current = el;
    if (!el || el.open) return;
    el.showModal();
    if (loaded.current) return;
    loaded.current = true;
    loadCalculatorData().then(setData).catch(() => setData(null));
  };

  const customers = data?.customers ?? [];
  function pickCustomer(id: string | null) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    // A client already on file fills in what we know about the home.
    if (c.sqft) setSqft(String(c.sqft));
    if (c.bedrooms != null) setBedrooms(String(c.bedrooms));
    if (c.bathrooms != null) { setFullBaths(String(Math.floor(c.bathrooms))); setHalfBaths(c.bathrooms % 1 ? "1" : "0"); }
    if ((CALC_PROPERTY_TYPES as readonly string[]).includes(c.propertyType ?? "")) setPropertyType(c.propertyType as (typeof CALC_PROPERTY_TYPES)[number]);
    const f = c.frequency === "every_four_weeks" ? "monthly" : c.frequency;
    if ((FREQUENCIES as readonly string[]).includes(f ?? "")) setFrequency(f as Frequency);
  }

  const input: CalcInput | null = useMemo(() => {
    const s = num(sqft), b = num(bedrooms), f = num(fullBaths), h = num(halfBaths || "0");
    if (s == null || s < 200 || s > 50_000 || b == null || f == null || h == null || b > 20 || f > 20 || h > 20) return null;
    return { sqft: s, bedrooms: b, fullBaths: f, halfBaths: h, pets, type, condition, frequency, addonIds };
  }, [sqft, bedrooms, fullBaths, halfBaths, pets, type, condition, frequency, addonIds]);
  const result = data && input ? calculate(data.config, input) : null;

  function use() {
    if (!input || !customerId) return;
    setError(null);
    start(async () => {
      const res = await createQuoteFromCalculator({ customerId, propertyType, input });
      // On success the server redirects to the new quote, so only a failure comes back here.
      if (res?.error) setError(res.error);
    });
  }

  const heading = "mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted";
  const dot = (c: string) => <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", c)} />;
  const label = "mb-1 block text-sm text-muted";
  const choice = (on: boolean, tone = "border-primary bg-primary-soft text-fg") =>
    cn("bp-fx rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors", on ? tone : "border-line bg-surface hover:border-primary hover:bg-surface-2");

  return createPortal(
    <dialog
      ref={begin} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-labelledby="calc-title"
      className="m-auto flex max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40"
    >
      <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><Calculator className="h-5 w-5" aria-hidden /></span>
          <div>
            <h2 id="calc-title" className="text-xl font-semibold leading-tight tracking-tight">{t("title")}</h2>
            <p className="text-sm text-muted">{t("subtitle")}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label={t("close")}><X className="h-5 w-5" aria-hidden /></button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {data === undefined && <p className="py-10 text-center text-sm text-muted" role="status">{t("loading")}</p>}
        {data === null && <Alert>{t("loadFailed")}</Alert>}
        {data && (
          <>
            <section>
              <h3 className={heading}>{t("client")}</h3>
              <CustomerSearch id="calc-client" customers={customers} selectedId={customerId} onSelect={(c) => pickCustomer(c?.id ?? null)} />
            </section>

            <section className="rounded-2xl border border-line bg-surface-2 p-4">
              <h3 className={heading}>{dot("bg-muted")} {t("propertyDetails")}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><label htmlFor="c-sqft" className={label}>{t("sqft")} *</label><Input id="c-sqft" value={sqft} onChange={(e) => setSqft(e.target.value)} inputMode="numeric" placeholder="2,000" /></div>
                <div><label htmlFor="c-beds" className={label}>{t("bedrooms")} *</label><Input id="c-beds" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} inputMode="numeric" placeholder="3" /></div>
                <div><label htmlFor="c-baths" className={label}>{t("fullBaths")} *</label><Input id="c-baths" value={fullBaths} onChange={(e) => setFullBaths(e.target.value)} inputMode="numeric" placeholder="2" /></div>
                <div><label htmlFor="c-half" className={label}>{t("halfBaths")}</label><Input id="c-half" value={halfBaths} onChange={(e) => setHalfBaths(e.target.value)} inputMode="numeric" placeholder="0" /></div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="c-prop" className={label}>{t("propertyType")}</label>
                  <Select id="c-prop" value={propertyType} onChange={(e) => setPropertyType(e.target.value as typeof propertyType)}>
                    {CALC_PROPERTY_TYPES.map((p) => <option key={p} value={p}>{t(`property.${p}`)}</option>)}
                  </Select>
                </div>
                <div>
                  <label htmlFor="c-pets" className={label}>{t("pets")}</label>
                  <Select id="c-pets" value={pets} onChange={(e) => setPets(e.target.value as PetOption)}>
                    {PET_OPTIONS.map((p) => <option key={p} value={p}>{t(`petOptions.${p}`)}</option>)}
                  </Select>
                </div>
              </div>
            </section>

            <section>
              <h3 className={heading}>{dot("bg-primary")} {t("cleaningType")}</h3>
              <div role="radiogroup" aria-label={t("cleaningType")} className="grid gap-3 sm:grid-cols-2">
                {CLEAN_TYPES.map((k) => {
                  const Icon = TYPE_ICONS[k];
                  const on = type === k;
                  return (
                    <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setType(k)} className={cn(choice(on), "flex gap-3 p-3.5")}>
                      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", on ? "text-primary" : "text-muted")} aria-hidden />
                      <span>
                        <span className="block font-semibold">{t(`types.${k}.name`)}</span>
                        <span className="block text-xs text-muted">{t(`types.${k}.desc`)}</span>
                        <span className="mt-0.5 block text-xs font-medium">{t("perSqft", { price: rateText(data.config.types[k].rate_mills) })}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="grid gap-6 sm:grid-cols-2">
              <section>
                <h3 className={heading}>{dot("bg-[var(--c-amber)]")} {t("conditionTitle")}</h3>
                <div role="radiogroup" aria-label={t("conditionTitle")} className="space-y-2">
                  {CONDITIONS.map((k) => {
                    const pct = data.config.conditions[k];
                    return (
                      <button key={k} type="button" role="radio" aria-checked={condition === k} onClick={() => setCondition(k)}
                        className={cn(choice(condition === k, "border-success bg-success-soft text-fg"), "flex w-full items-center justify-between gap-2")}>
                        <span>{t(`condition.${k}`)}</span>
                        <span className="text-xs font-semibold">{pct > 0 ? `+${pct}%` : condition === k ? <Check className="h-4 w-4" aria-hidden /> : null}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
              <section>
                <h3 className={heading}>{dot("bg-[var(--c-blue)]")} {t("frequencyTitle")}</h3>
                <div role="radiogroup" aria-label={t("frequencyTitle")} className="space-y-2">
                  {FREQUENCIES.map((k) => {
                    const pct = data.config.frequencies[k];
                    return (
                      <button key={k} type="button" role="radio" aria-checked={frequency === k} onClick={() => setFrequency(k)}
                        className={cn(choice(frequency === k, "border-fg/40 bg-surface-2 text-fg"), "flex w-full items-center justify-between gap-2")}>
                        <span>{t(`frequency.${k}`)}</span>
                        <span className="text-xs text-muted">{pct > 0 ? t("off", { percent: pct }) : t("standardRate")}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-[var(--c-amber)]/30 bg-[var(--c-amber)]/10 p-4">
              <h3 className={cn(heading, "text-[var(--c-amber)]")}>{dot("bg-[var(--c-amber)]")} {t("addons")}</h3>
              {data.config.addons.length === 0 ? (
                <p className="text-sm text-muted">{t("noAddons")}</p>
              ) : (
                <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {data.config.addons.map((a) => (
                    <li key={a.id}>
                      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-2 text-sm hover:bg-surface/60">
                        <span className="flex items-center gap-3">
                          <input type="checkbox" checked={addonIds.includes(a.id)} onChange={(e) => setAddonIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))} className="h-5 w-5 rounded border-line accent-[var(--c-violet)]" />
                          {a.name}
                        </span>
                        <span className="text-xs font-semibold text-muted">+{money(a.price_cents)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-live="polite" className="rounded-2xl border border-line p-4">
              <h3 className={heading}>{t("estimate")}</h3>
              {!result || !input ? (
                <p className="text-sm text-muted">{t("enterDetails")}</p>
              ) : (
                <dl className="space-y-1.5 text-sm">
                  <Line
                    label={result.minimum_applied ? t("breakdown.minimum", { type: t(`types.${type}.name`) }) : t("breakdown.cleaning", { type: t(`types.${type}.name`), sqft: input.sqft.toLocaleString("en-US"), rate: rateText(data.config.types[type].rate_mills) })}
                    value={money(result.cleaning_cents)}
                  />
                  {result.baths_cents > 0 && <Line label={t("breakdown.baths")} value={money(result.baths_cents)} />}
                  {result.condition_cents > 0 && <Line label={t("breakdown.condition", { percent: data.config.conditions[condition] })} value={money(result.condition_cents)} />}
                  {result.pets_cents > 0 && <Line label={t("breakdown.pets")} value={money(result.pets_cents)} />}
                  {result.discount_cents > 0 && <Line label={t("breakdown.discount", { frequency: t(`frequency.${frequency}`), percent: data.config.frequencies[frequency] })} value={`−${money(result.discount_cents)}`} tone="text-success" />}
                  {result.addons.map((a) => <Line key={a.id} label={a.name} value={money(a.price_cents)} />)}
                </dl>
              )}
            </section>
          </>
        )}
        {error && <Alert>{t(`errors.${error}`)}</Alert>}
      </div>

      <footer className="border-t border-line bg-surface px-6 py-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">{t("total")}</p>
            <p className="text-xs text-muted">{t("beforeTax")}</p>
          </div>
          <p className="text-3xl font-extrabold tabular-nums tracking-tight">{result ? money(result.total_cents) : "—"}</p>
        </div>
        {data && !customerId && result && <p className="mb-2 text-xs text-muted">{t("needClient")}</p>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {data?.canEditRates && <Link href="/settings/pricing" className="mr-auto text-sm text-primary hover:underline">{t("editRates")}</Link>}
          <Button type="button" variant="secondary" onClick={onClose}>{t("cancel")}</Button>
          <Button type="button" onClick={use} disabled={!result || !customerId || pending}>{pending ? t("creating") : t("use")}</Button>
        </div>
      </footer>
    </dialog>,
    document.body,
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("font-medium tabular-nums", tone)}>{value}</dd>
    </div>
  );
}
