"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Card, Input, SectionTitle, cn } from "@/components/ui";
import { savePricingSettings } from "@/modules/pricing/actions";
import { CLEAN_TYPES, CONDITIONS, FREQUENCIES, MAX_ADDONS, millsToText, type PricingConfig } from "@/modules/pricing/config";

const dollars = (cents: number) => (cents / 100).toFixed(2);

/** A number box with a unit next to it ("$" before, "%" after). */
function Unit({ before, after, children }: { before?: string; after?: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {before && <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{before}</span>}
      {children}
      {after && <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{after}</span>}
    </div>
  );
}

type Row = { key: number; id: string; name: string; price: string };

export function PricingSettingsForm({ config, canEdit }: { config: PricingConfig; canEdit: boolean }) {
  const t = useTranslations("pricing");
  const ts = useTranslations("pricing.settings");
  const [rows, setRows] = useState<Row[]>(() => config.addons.map((a, i) => ({ key: i, id: a.id, name: a.name, price: dollars(a.price_cents) })));
  const [next, setNext] = useState(config.addons.length);

  const patch = (key: number, p: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const add = () => { setRows((r) => [...r, { key: next, id: "", name: "", price: "" }]); setNext((n) => n + 1); };
  const remove = (key: number) => setRows((r) => r.filter((x) => x.key !== key));

  const num = "h-10 text-right tabular-nums";
  const rowLabel = "text-sm font-medium";
  return (
    <form action={savePricingSettings} className="space-y-6">
      <fieldset disabled={!canEdit} className="space-y-6">
        <Card accent="teal" className="space-y-4">
          <div>
            <SectionTitle accent="teal">{ts("typesTitle")}</SectionTitle>
            <p className="mt-1 text-sm text-muted">{ts("typesHelp")}</p>
          </div>
          <div className="hidden grid-cols-[1fr_8rem_8rem] gap-3 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
            <span />
            <span className="text-right">{ts("rate")}</span>
            <span className="text-right">{ts("minimum")}</span>
          </div>
          {CLEAN_TYPES.map((k) => (
            <div key={k} className="grid items-center gap-x-3 gap-y-2 sm:grid-cols-[1fr_8rem_8rem]">
              <div>
                <label htmlFor={`rate_${k}`} className={rowLabel}>{t(`types.${k}.name`)}</label>
                <p className="text-xs text-muted">{t(`types.${k}.desc`)}</p>
              </div>
              <Unit before="$">
                <Input id={`rate_${k}`} name={`rate_${k}`} inputMode="decimal" defaultValue={millsToText(config.types[k].rate_mills)} aria-label={`${t(`types.${k}.name`)} — ${ts("rate")}`} className={cn(num, "pl-6")} />
              </Unit>
              <Unit before="$">
                <Input id={`min_${k}`} name={`min_${k}`} inputMode="decimal" defaultValue={dollars(config.types[k].min_cents)} aria-label={`${t(`types.${k}.name`)} — ${ts("minimum")}`} className={cn(num, "pl-6")} />
              </Unit>
            </div>
          ))}
          <p className="text-xs text-muted">{ts("example")}</p>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card accent="amber" className="space-y-4">
            <div>
              <SectionTitle accent="amber">{ts("conditionsTitle")}</SectionTitle>
              <p className="mt-1 text-sm text-muted">{ts("conditionsHelp")}</p>
            </div>
            {CONDITIONS.map((k) => (
              <div key={k} className="grid grid-cols-[1fr_7rem] items-center gap-3">
                <label htmlFor={`cond_${k}`} className={rowLabel}>{t(`condition.${k}`)}</label>
                <Unit after="%">
                  <Input id={`cond_${k}`} name={`cond_${k}`} inputMode="numeric" defaultValue={String(config.conditions[k])} className={cn(num, "pr-7")} />
                </Unit>
              </div>
            ))}
          </Card>

          <Card accent="blue" className="space-y-4">
            <div>
              <SectionTitle accent="blue">{ts("frequenciesTitle")}</SectionTitle>
              <p className="mt-1 text-sm text-muted">{ts("frequenciesHelp")}</p>
            </div>
            {FREQUENCIES.map((k) => (
              <div key={k} className="grid grid-cols-[1fr_7rem] items-center gap-3">
                <label htmlFor={`freq_${k}`} className={rowLabel}>{t(`frequency.${k}`)}</label>
                <Unit after="%">
                  <Input id={`freq_${k}`} name={`freq_${k}`} inputMode="numeric" defaultValue={String(config.frequencies[k])} className={cn(num, "pr-7")} />
                </Unit>
              </div>
            ))}
          </Card>
        </div>

        <Card accent="violet" className="space-y-4">
          <div>
            <SectionTitle accent="violet">{ts("extrasTitle")}</SectionTitle>
            <p className="mt-1 text-sm text-muted">{ts("extrasHelp")}</p>
          </div>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div className="grid grid-cols-[1fr_7rem] items-center gap-3">
              <label htmlFor="bath_free" className={rowLabel}>{ts("freeBaths")}</label>
              <Input id="bath_free" name="bath_free" inputMode="numeric" defaultValue={String(config.baths.free_full)} className={num} />
            </div>
            <div className="grid grid-cols-[1fr_7rem] items-center gap-3">
              <label htmlFor="bath_full" className={rowLabel}>{ts("fullBath")}</label>
              <Unit before="$"><Input id="bath_full" name="bath_full" inputMode="decimal" defaultValue={dollars(config.baths.full_cents)} className={cn(num, "pl-6")} /></Unit>
            </div>
            <div className="grid grid-cols-[1fr_7rem] items-center gap-3">
              <label htmlFor="bath_half" className={rowLabel}>{ts("halfBath")}</label>
              <Unit before="$"><Input id="bath_half" name="bath_half" inputMode="decimal" defaultValue={dollars(config.baths.half_cents)} className={cn(num, "pl-6")} /></Unit>
            </div>
            <div className="grid grid-cols-[1fr_7rem] items-center gap-3">
              <label htmlFor="pet_one" className={rowLabel}>{ts("pet1")}</label>
              <Unit before="$"><Input id="pet_one" name="pet_one" inputMode="decimal" defaultValue={dollars(config.pets.one_cents)} className={cn(num, "pl-6")} /></Unit>
            </div>
            <div className="grid grid-cols-[1fr_7rem] items-center gap-3">
              <label htmlFor="pet_many" className={rowLabel}>{ts("pet2")}</label>
              <Unit before="$"><Input id="pet_many" name="pet_many" inputMode="decimal" defaultValue={dollars(config.pets.many_cents)} className={cn(num, "pl-6")} /></Unit>
            </div>
          </div>
        </Card>

        <Card accent="rose" className="space-y-4">
          <div>
            <SectionTitle accent="rose">{ts("addonsTitle")}</SectionTitle>
            <p className="mt-1 text-sm text-muted">{ts("addonsHelp")}</p>
          </div>
          <input type="hidden" name="addons" value={JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, price: r.price })))} />
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                <Input value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} maxLength={60} placeholder={ts("addonName")} aria-label={ts("addonName")} />
                <Unit before="$">
                  <Input value={r.price} onChange={(e) => patch(r.key, { price: e.target.value })} inputMode="decimal" placeholder="0.00" aria-label={ts("addonPrice")} className={cn(num, "pl-6")} />
                </Unit>
                <button type="button" onClick={() => remove(r.key)} aria-label={ts("removeAddon", { name: r.name || ts("unnamed") })}
                  className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-50">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {rows.length < MAX_ADDONS && (
            <Button type="button" variant="secondary" onClick={add}><Plus className="h-4 w-4" aria-hidden /> {ts("addAddon")}</Button>
          )}
        </Card>
      </fieldset>

      {canEdit ? <Button type="submit">{ts("save")}</Button> : <p className="text-sm text-muted">{ts("readOnly")}</p>}
    </form>
  );
}

/** "Reset to Austin defaults", with a confirmation because it replaces every rate. */
export function ResetRatesButton({ action }: { action: () => Promise<void> }) {
  const ts = useTranslations("pricing.settings");
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm(ts("confirmReset"))) e.preventDefault(); }}>
      <Button type="submit" variant="ghost">{ts("reset")}</Button>
    </form>
  );
}
