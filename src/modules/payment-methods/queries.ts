import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { BUILTIN_METHODS, type PaymentMethod } from "./labels";

/** The company's payment methods in their order (RLS limits it to the signed-in company). Falls back to the built-in codes if the table is empty. */
export const listPaymentMethods = cache(async (): Promise<(PaymentMethod & { id: string })[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("payment_methods").select("id,code,name,is_active").order("sort_order").order("created_at");
  if (data && data.length) return data;
  const en: Record<string, string> = { cash: "Cash", check: "Check", card: "Card", zelle: "Zelle", venmo: "Venmo", bank_transfer: "Bank transfer", other: "Other" };
  return BUILTIN_METHODS.map((code) => ({ id: code, code, name: en[code], is_active: true }));
});
