"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { displayName } from "@/modules/customers/schema";
import { getQuoteSettings } from "@/modules/quotes/queries";
import { calcInputSchema, calculate, CALC_PROPERTY_TYPES, type PricingConfig } from "./config";
import { parsePricingForm } from "./form";
import { getPricingConfig } from "./queries";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function savePricingSettings(formData: FormData) {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect("/settings/pricing");
  const config = parsePricingForm(formData);
  if (!config) redirect("/settings/pricing?error=1");
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_settings").update({ price_calculator: config }).eq("tenant_id", ctx.tenant.id);
  revalidatePath("/settings/pricing");
  redirect(error ? "/settings/pricing?error=1" : "/settings/pricing?saved=1");
}

/** Back to the built-in Austin, TX rates. */
export async function resetPricingSettings() {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:write")) redirect("/settings/pricing");
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_settings").update({ price_calculator: null }).eq("tenant_id", ctx.tenant.id);
  revalidatePath("/settings/pricing");
  redirect(error ? "/settings/pricing?error=1" : "/settings/pricing?reset=1");
}

export type CalculatorCustomer = {
  id: string; name: string; email: string | null; phone: string | null; address: string | null; company: string | null;
  sqft: number | null; bedrooms: number | null; bathrooms: number | null; propertyType: string | null; frequency: string | null;
};
export type CalculatorData = { config: PricingConfig; customers: CalculatorCustomer[]; canEditRates: boolean };

/** Loaded when the calculator opens, so the Quotes list itself stays light. */
export async function loadCalculatorData(): Promise<CalculatorData | null> {
  const ctx = await requireContext();
  if (!can(ctx.role, "quotes:write")) return null;
  const supabase = await createClient();
  const [{ config }, { data }] = await Promise.all([
    getPricingConfig(ctx.tenant.id),
    supabase
      .from("customers")
      .select("id,first_name,last_name,company_name,email,phone,service_address,billing_address,city,state,zip_code,square_footage,bedrooms,bathrooms,property_type,cleaning_frequency")
      .neq("status", "archived").order("first_name").limit(1000),
  ]);
  return {
    config,
    canEditRates: can(ctx.role, "settings:write"),
    customers: (data ?? []).map((c) => ({
      id: c.id, name: displayName(c), email: c.email, phone: c.phone, company: c.company_name || null,
      address: [c.service_address || c.billing_address, c.city, [c.state, c.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
      sqft: c.square_footage, bedrooms: c.bedrooms, bathrooms: c.bathrooms == null ? null : Number(c.bathrooms),
      propertyType: c.property_type, frequency: c.cleaning_frequency,
    })),
  };
}

const requestSchema = z.object({
  customerId: z.string().uuid(),
  propertyType: z.enum(CALC_PROPERTY_TYPES),
  input: calcInputSchema,
});

/** "Use This Quote": the price is calculated again here from the company's saved rates. A number sent by the browser is never trusted. */
export async function createQuoteFromCalculator(request: unknown): Promise<{ error: "invalid" | "saveFailed" }> {
  const ctx = await requireContext();
  if (!can(ctx.role, "quotes:write")) redirect("/quotes");
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) return { error: "invalid" };
  const { customerId, propertyType, input } = parsed.data;

  const [{ config }, qs] = await Promise.all([getPricingConfig(ctx.tenant.id), getQuoteSettings(ctx.tenant.id)]);
  const b = calculate(config, input);
  // The wording of the quote follows the company's document language, not the screen language of whoever clicked.
  const t = await getTranslations({ locale: ctx.settings.doc_locale, namespace: "pricing" });
  const typeName = t(`types.${input.type}.name`);
  const baths = `${input.fullBaths}${input.halfBaths ? `+${input.halfBaths}` : ""}`;
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + qs.quote_valid_days);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      tenant_id: ctx.tenant.id, customer_id: customerId, created_by: ctx.userId,
      title: `${typeName} · ${input.sqft.toLocaleString("en-US")} sq ft`.slice(0, 120),
      expires_on: isoDay(expires), tax_rate: qs.default_tax_rate, terms: qs.quote_terms, discount_cents: b.discount_cents,
    })
    .select("id").single();
  if (error || !data) return { error: "saveFailed" };

  const description = t("doc.optionDescription", {
    sqft: input.sqft.toLocaleString("en-US"), beds: input.bedrooms, baths, property: t(`property.${propertyType}`), frequency: t(`frequency.${input.frequency}`),
  });
  const lines: { description: string; unit_price_cents: number }[] = [];
  if (b.condition_cents > 0) lines.push({ description: t("doc.condition", { condition: t(`condition.${input.condition}`), percent: config.conditions[input.condition] }), unit_price_cents: b.condition_cents });
  if (b.pets_cents > 0) lines.push({ description: t("doc.pets"), unit_price_cents: b.pets_cents });
  for (const a of b.addons) lines.push({ description: a.name, unit_price_cents: a.price_cents });

  const { error: optError } = await supabase.from("quote_options").insert({
    tenant_id: ctx.tenant.id, quote_id: data.id, name: typeName, description, base_price_cents: b.cleaning_cents + b.baths_cents, position: 1,
  });
  const { error: lineError } = lines.length
    ? await supabase.from("quote_lines").insert(lines.map((l, i) => ({ tenant_id: ctx.tenant.id, quote_id: data.id, description: l.description.slice(0, 200), quantity: 1, unit_price_cents: l.unit_price_cents, position: i + 1 })))
    : { error: null };
  if (optError || lineError) {
    await supabase.from("quotes").delete().eq("id", data.id); // do not leave a half-built draft behind
    return { error: "saveFailed" };
  }
  revalidatePath("/quotes");
  redirect(`/quotes/${data.id}`);
}
