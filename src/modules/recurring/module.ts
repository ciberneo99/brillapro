// Recurring schedules: schema + queries (server-only). Actions live in actions.ts.
import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseMoneyToCents } from "@/lib/money";
import { parseTime } from "@/lib/time";
import { normalizeAddress, normalizeName, normalizeSentences } from "@/lib/text";

export const FREQUENCIES = ["weekly", "biweekly", "every_four_weeks", "monthly"] as const;
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sentence = (max: number) =>
  z.string().optional().transform((v) => normalizeSentences(v ?? "").trim()).pipe(z.string().max(max)).transform((v) => v || null);
const timeField = z.string().optional().transform((v) => parseTime(v));

export const recurringSchema = z
  .object({
    title: z.string().transform((v) => normalizeName(v).trim()).pipe(z.string().min(1).max(120)),
    service_type_id: z.string().optional().transform((v) => (v ? v : null)).pipe(z.string().uuid().nullable()),
    frequency: z.enum(FREQUENCIES),
    start_date: iso,
    until_date: z.string().optional().transform((v) => (v ? v : null)).pipe(iso.nullable()),
    start_time: timeField,
    end_time: timeField,
    address: z.string().optional().transform((v) => normalizeAddress(v ?? "").trim()).pipe(z.string().max(300)).transform((v) => v || null),
    access_notes: sentence(1000),
    price: z.string().optional().transform((v, ctx) => {
      const t = (v ?? "").trim();
      if (t === "") return 0;
      const c = parseMoneyToCents(t);
      if (c == null || c > 99_999_999) { ctx.addIssue({ code: "custom", message: "money" }); return z.NEVER; }
      return c;
    }),
    notes: sentence(2000),
  })
  .refine((v) => !v.until_date || v.until_date >= v.start_date, { path: ["until_date"], message: "dates" })
  .refine((v) => !v.start_time || !v.end_time || v.end_time > v.start_time, { path: ["end_time"], message: "time" })
  .transform(({ price, ...rest }) => ({ ...rest, price_cents: price }));

export type ScheduleRow = {
  id: string; title: string; frequency: string; start_date: string; until_date: string | null; start_time: string | null;
  price_cents: number; is_active: boolean; generated_until: string | null; customer_id: string; customerName: string; employees: string[];
};

export async function listSchedules(): Promise<ScheduleRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_schedules")
    .select("id,title,frequency,start_date,until_date,start_time,price_cents,is_active,generated_until,customer_id,customers(first_name,last_name,company_name),recurring_schedule_employees(employees(full_name))")
    .order("is_active", { ascending: false }).order("start_date");
  return (data ?? []).map((r) => {
    const c = r.customers as unknown as { first_name: string; last_name: string; company_name: string } | null;
    const emps = (r.recurring_schedule_employees as unknown as { employees: { full_name: string } | null }[]) ?? [];
    return {
      id: r.id, title: r.title, frequency: r.frequency, start_date: r.start_date, until_date: r.until_date, start_time: r.start_time,
      price_cents: r.price_cents, is_active: r.is_active, generated_until: r.generated_until, customer_id: r.customer_id,
      customerName: c ? (`${c.first_name} ${c.last_name}`.trim() || c.company_name) : "",
      employees: emps.map((e) => e.employees?.full_name ?? "").filter(Boolean),
    };
  });
}
