// Employees: queries + schema (server-only). Actions live in actions.ts.
import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, sanitizeEmail } from "@/lib/email";
import { normalizePhone } from "@/lib/phone";
import { normalizeAddress, normalizeName, normalizeSentences, normalizeState } from "@/lib/text";
import { normalizeZip } from "@/lib/zip";

export type Employee = { id: string; user_id: string | null; full_name: string; phone: string | null; phone_2: string | null; email: string | null; notes: string | null; is_active: boolean;
  address: string | null; city: string | null; state: string | null; zip_code: string | null };

export async function listEmployees(opts: { activeOnly?: boolean } = {}): Promise<Employee[]> {
  const supabase = await createClient();
  let q = supabase.from("employees").select("id,user_id,full_name,phone,phone_2,email,notes,is_active,address,city,state,zip_code").order("is_active", { ascending: false }).order("full_name");
  if (opts.activeOnly) q = q.eq("is_active", true);
  const { data } = await q;
  return data ?? [];
}

export const employeeSchema = z.object({
  user_id: z.string().optional().transform((v) => (v ? v : null)).pipe(z.string().uuid().nullable()),
  full_name: z.string().transform((v) => normalizeName(v).trim()).pipe(z.string().min(1).max(120)),
  phone: z.string().optional().transform((v) => normalizePhone(v ?? "").trim()).pipe(z.string().max(30)).transform((v) => v || null),
  phone_2: z.string().optional().transform((v) => normalizePhone(v ?? "").trim()).pipe(z.string().max(30)).transform((v) => v || null),
  address: z.string().optional().transform((v) => normalizeAddress((v ?? "").trim())).pipe(z.string().max(300)).transform((v) => v || null),
  city: z.string().optional().transform((v) => normalizeAddress((v ?? "").trim())).pipe(z.string().max(100)).transform((v) => v || null),
  state: z.string().optional().transform((v) => normalizeState((v ?? "").trim())).pipe(z.string().max(60)).transform((v) => v || null),
  zip_code: z.string().trim().max(20).optional().transform((v, ctx) => {
    const z5 = normalizeZip(v ?? "");
    if (z5 === "invalid") { ctx.addIssue({ code: "custom", message: "invalid" }); return z.NEVER; }
    return z5 || null;
  }),
  email: z.string().optional().transform((v) => sanitizeEmail(v ?? "")).refine((v) => v === "" || isValidEmail(v)).transform((v) => v || null),
  notes: z.string().optional().transform((v) => normalizeSentences(v ?? "").trim()).pipe(z.string().max(1000)).transform((v) => v || null),
});
