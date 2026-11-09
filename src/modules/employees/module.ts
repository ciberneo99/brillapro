// Employees: queries + schema (server-only). Actions live in actions.ts.
import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, sanitizeEmail } from "@/lib/email";
import { normalizePhone } from "@/lib/phone";
import { normalizeName, normalizeSentences } from "@/lib/text";

export type Employee = { id: string; user_id: string | null; full_name: string; phone: string | null; email: string | null; notes: string | null; is_active: boolean };

export async function listEmployees(opts: { activeOnly?: boolean } = {}): Promise<Employee[]> {
  const supabase = await createClient();
  let q = supabase.from("employees").select("id,user_id,full_name,phone,email,notes,is_active").order("is_active", { ascending: false }).order("full_name");
  if (opts.activeOnly) q = q.eq("is_active", true);
  const { data } = await q;
  return data ?? [];
}

export const employeeSchema = z.object({
  user_id: z.string().optional().transform((v) => (v ? v : null)).pipe(z.string().uuid().nullable()),
  full_name: z.string().transform((v) => normalizeName(v).trim()).pipe(z.string().min(1).max(120)),
  phone: z.string().optional().transform((v) => normalizePhone(v ?? "").trim()).pipe(z.string().max(30)).transform((v) => v || null),
  email: z.string().optional().transform((v) => sanitizeEmail(v ?? "")).refine((v) => v === "" || isValidEmail(v)).transform((v) => v || null),
  notes: z.string().optional().transform((v) => normalizeSentences(v ?? "").trim()).pipe(z.string().max(1000)).transform((v) => v || null),
});
