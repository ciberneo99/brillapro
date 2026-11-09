import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { parseTime } from "@/lib/time";
import { normalizeAddress, normalizeName, normalizeSentences } from "@/lib/text";

export const JOB_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

const sentence = (max: number) =>
  z.string().optional().transform((v) => normalizeSentences(v ?? "").trim()).pipe(z.string().max(max)).transform((v) => v || null);
const timeField = z.string().optional().transform((v) => parseTime(v));

export const jobSchema = z
  .object({
    title: z.string().transform((v) => normalizeName(v).trim()).pipe(z.string().min(1).max(120)),
    service_type_id: z.string().optional().transform((v) => (v ? v : null)).pipe(z.string().uuid().nullable()),
    scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  .refine((v) => !v.start_time || !v.end_time || v.end_time > v.start_time, { path: ["end_time"], message: "time" })
  .transform(({ price, ...rest }) => ({ ...rest, price_cents: price }));
