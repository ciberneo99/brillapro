"use server";

import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { isValidEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { FREQUENCIES, PROPERTY_TYPES } from "@/modules/customers/schema";

export type RequestState = { error?: "invalid" | "contactNeeded" | "unavailable" | "tooMany" | "tooFast" | "failed"; done?: boolean } | undefined;

const t = (max: number) => z.string().trim().max(max).optional().default("");

const schema = z.object({
  first_name: t(100), last_name: t(100), company_name: t(150),
  email: z.string().trim().toLowerCase().max(254).optional().default(""),
  phone: z.string().trim().max(40).optional().default("").transform(normalizePhone), service_address: t(300), city: t(100), state: t(60), zip_code: t(20),
  property_type: z.enum(PROPERTY_TYPES).or(z.literal("")).optional().default(""),
  square_footage: z.string().trim().regex(/^\d{0,7}$/).optional().default(""),
  bedrooms: z.string().trim().regex(/^\d{0,2}$/).optional().default(""),
  bathrooms: z.string().trim().regex(/^(\d{1,2}(\.5)?)?$/).optional().default(""),
  cleaning_frequency: z.enum(FREQUENCIES).or(z.literal("")).optional().default(""),
  preferred_service: t(100), message: t(2000),
});

const MIN_FILL_MS = 3000; // humans take longer than this to fill a form

/** Public intake. The only thing visitors can do: create a Prospect via the SECURITY DEFINER function. */
export async function submitQuoteRequest(slug: string, _: RequestState, formData: FormData): Promise<RequestState> {
  // Honeypot: real users never see or fill this field. Pretend success so bots learn nothing.
  if (String(formData.get("website") ?? "") !== "") return { done: true };

  const rendered = Number(formData.get("rendered_at"));
  if (!Number.isFinite(rendered) || Date.now() - rendered < MIN_FILL_MS) return { error: "tooFast" };

  const parsed = schema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { error: "invalid" };
  const d = parsed.data;
  if (!d.email && !d.phone) return { error: "contactNeeded" };
  if (d.email && !isValidEmail(d.email)) return { error: "invalid" };
  if (`${d.first_name}${d.last_name}${d.company_name}`.trim() === "") return { error: "invalid" };

  const supabase = await createClient(); // no session: runs as the anonymous role
  const { error } = await supabase.rpc("submit_quote_request", { p_slug: slug.slice(0, 80), p_data: d });
  if (!error) return { done: true };
  if (error.code === "P0002") return { error: "unavailable" };
  if (error.code === "53400") return { error: "tooMany" };
  if (error.code === "22023") return { error: "invalid" };
  return { error: "failed" };
}
