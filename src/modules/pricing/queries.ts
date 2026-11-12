import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readPricingConfig, type PricingConfig } from "./config";

/** The company's rates, or the Austin defaults when it never changed them (or the column is not there yet). */
export async function getPricingConfig(tenantId: string): Promise<{ config: PricingConfig; custom: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.from("tenant_settings").select("price_calculator").eq("tenant_id", tenantId).single();
  const stored = (data as { price_calculator?: unknown } | null)?.price_calculator ?? null;
  return { config: readPricingConfig(stored), custom: stored != null };
}
