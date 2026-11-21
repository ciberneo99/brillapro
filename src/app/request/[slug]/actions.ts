"use server";

import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { isValidEmail } from "@/lib/email";
import { normalizeAddress, normalizeName, normalizeSentences, normalizeState } from "@/lib/text";
import { normalizeZip } from "@/lib/zip";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { clientIpHash } from "@/lib/client-ip";
import { verifyTurnstile } from "@/lib/turnstile";
import { FREQUENCIES, PROPERTY_TYPES } from "@/modules/customers/schema";

export type RequestState = { error?: "invalid" | "required" | "contactNeeded" | "unavailable" | "tooMany" | "tooFast" | "failed"; done?: boolean } | undefined;

const t = (max: number) => z.string().trim().max(max).optional().default("");
const sn = (max: number) => z.string().trim().max(max).optional().default("").transform(normalizeSentences);
const zipField = z.string().trim().max(20).optional().default("").transform((v, ctx) => {
  const r = normalizeZip(v);
  if (r === "invalid") {
    ctx.addIssue({ code: "custom", message: "invalid" });
    return z.NEVER;
  }
  return r ?? "";
});
const nm =(max: number) => z.string().trim().max(max).optional().default("").transform(normalizeName);
const ad = (max: number) => z.string().trim().max(max).optional().default("").transform(normalizeAddress);

const schema = z.object({
  first_name: nm(100), last_name: nm(100), company_name: t(150),
  email: z.string().trim().toLowerCase().max(254).optional().default(""),
  phone: z.string().trim().max(40).optional().default("").transform(normalizePhone), service_address: ad(300), city: ad(100), state: z.string().trim().max(60).optional().default("").transform(normalizeState), zip_code: zipField,
  property_type: z.enum(PROPERTY_TYPES).or(z.literal("")).optional().default(""),
  square_footage: z.string().optional().default("").transform((v) => v.trim().replace(/,/g, "")).pipe(z.string().regex(/^\d{0,7}$/)),
  bedrooms: z.string().trim().regex(/^\d{0,2}$/).optional().default(""),
  bathrooms: z.string().trim().regex(/^(\d{1,2}(\.5)?)?$/).optional().default(""),
  cleaning_frequency: z.enum(FREQUENCIES).or(z.literal("")).optional().default(""),
  // The database keeps it only if it matches one of the company's active services (see public.submit_quote_request).
  preferred_service: t(100), message: sn(2000),
});

const MIN_FILL_MS = 3000; // humans take longer than this to fill a form

/** Public intake. The only thing visitors can do: create a Prospect via the SECURITY DEFINER function. */
export async function submitQuoteRequest(slug: string, _: RequestState, formData: FormData): Promise<RequestState> {
  // Honeypot: real users never see or fill this field. Pretend success so bots learn nothing.
  if (String(formData.get("website") ?? "") !== "") return { done: true };

  const rendered = Number(formData.get("rendered_at"));
  if (!Number.isFinite(rendered) || Date.now() - rendered < MIN_FILL_MS) return { error: "tooFast" };

  if (!(await verifyTurnstile(String(formData.get("cf-turnstile-response") ?? "")))) return { error: "tooFast" };

  const parsed = schema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { error: "invalid" };
  const d = parsed.data;
  // First name, last name, email and phone are mandatory (the form marks them with *).
  if (!d.first_name || !d.last_name || !d.email || d.phone.replace(/\D/g, "").length < 10) return { error: "required" };
  if (!isValidEmail(d.email)) return { error: "invalid" };

  const supabase = await createClient(); // no session: runs as the anonymous role
  // A service is mandatory too, whenever the company offers any: it must be one of its active services.
  const { data: services } = await supabase.rpc("public_request_services", { p_slug: slug.slice(0, 80) });
  const offered = ((services ?? []) as { name: string }[]).map((x) => x.name.toLowerCase());
  if (offered.length > 0 && !offered.includes(d.preferred_service.toLowerCase())) return { error: "required" };

  // The intake is not callable with the public anon key: it goes through the server-only service client,
  // which also applies the per-visitor limit (hashed IP).
  let intake;
  try {
    intake = await createServiceClient().rpc("submit_quote_request_checked", {
      p_slug: slug.slice(0, 80), p_data: d, p_ip_hash: await clientIpHash(),
    });
  } catch {
    return { error: "failed" };
  }
  const { error } = intake;
  if (!error) return { done: true };
  if (error.code === "P0002") return { error: "unavailable" };
  if (error.code === "53400") return { error: "tooMany" };
  if (error.code === "22023") return { error: "invalid" };
  return { error: "failed" };
}
