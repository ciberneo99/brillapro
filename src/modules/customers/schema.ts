import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

export const STATUSES = ["prospect", "active", "inactive", "archived"] as const;
export type CustomerStatus = (typeof STATUSES)[number];
export const PROPERTY_TYPES = ["house", "apartment", "condo", "townhouse", "office", "commercial", "other"] as const;
export const FREQUENCIES = ["one_time", "weekly", "biweekly", "monthly", "every_four_weeks", "custom"] as const;

/** "" → null so empty inputs clear the column instead of storing blank strings. */
const text = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v));
/** Phone numbers are stored as xxx-xxx-xxxx when they are complete US numbers. */
const phone = z.string().trim().max(40).transform((v) => (v === "" ? null : normalizePhone(v)));
const textOrEmpty = (max: number) => z.string().trim().max(max);
const intOrNull = (min: number, max: number) =>
  z.string().trim().transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: "invalid" });
      return z.NEVER;
    }
    return n;
  });
const oneOfOrNull = <T extends readonly [string, ...string[]]>(values: T) =>
  z.string().trim().transform((v, ctx) => {
    if (v === "") return null;
    if (!(values as readonly string[]).includes(v)) {
      ctx.addIssue({ code: "custom", message: "invalid" });
      return z.NEVER;
    }
    return v as T[number];
  });

/** Dollars typed by a person → integer cents (never floats in the database). */
const priceToCents = z.string().trim().transform((v, ctx) => {
  if (v === "") return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(v.replace(/,/g, ""))) {
    ctx.addIssue({ code: "custom", message: "invalid" });
    return z.NEVER;
  }
  return Math.round(Number(v.replace(/,/g, "")) * 100);
});

const bathrooms = z.string().trim().transform((v, ctx) => {
  if (v === "") return null;
  const n = Number(v);
  if (!(n >= 0 && n <= 50 && Number.isInteger(n * 2))) {
    ctx.addIssue({ code: "custom", message: "invalid" });
    return z.NEVER;
  }
  return n;
});

const date = z.string().trim().transform((v, ctx) => {
  if (v === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    ctx.addIssue({ code: "custom", message: "invalid" });
    return z.NEVER;
  }
  return v;
});

const fields = z
  .object({
    first_name: textOrEmpty(100),
    last_name: textOrEmpty(100),
    company_name: textOrEmpty(150),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email().max(254))]).transform((v) => (v === "" ? null : v)),
    phone,
    secondary_phone: phone,
    service_address: text(300),
    billing_address: text(300),
    city: text(100),
    state: text(60),
    zip_code: text(20),
    property_type: oneOfOrNull(PROPERTY_TYPES),
    square_footage: intOrNull(1, 1_000_000),
    bedrooms: intOrNull(0, 50),
    bathrooms,
    cleaning_frequency: oneOfOrNull(FREQUENCIES),
    preferred_service: text(100),
    estimated_price: priceToCents, // typed in dollars, stored as cents (see transform below)
    access_instructions: text(2000),
    pets: text(300),
    special_instructions: text(2000),
    notes: text(5000),
    customer_since: date,
  })
  .refine((v) => `${v.first_name}${v.last_name}${v.company_name}`.trim() !== "", { message: "identityRequired", path: ["first_name"] })
  .transform(({ estimated_price, ...rest }) => ({ ...rest, estimated_price_cents: estimated_price }));

const FORM_KEYS = [
  "first_name", "last_name", "company_name", "email", "phone", "secondary_phone", "service_address", "billing_address",
  "city", "state", "zip_code", "property_type", "square_footage", "bedrooms", "bathrooms", "cleaning_frequency",
  "preferred_service", "estimated_price", "access_instructions", "pets", "special_instructions", "notes", "customer_since",
] as const;

/** Missing keys count as empty (a form never has to send every field). Unknown keys are dropped. */
export const customerFormSchema = z.preprocess((raw) => {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(FORM_KEYS.map((k) => [k, typeof src[k] === "string" ? src[k] : ""]));
}, fields);

/** DB cents → the dollars string shown in the form. */
export const centsToInput = (cents: number | null): string => (cents == null ? "" : (cents / 100).toFixed(2));

export type CustomerInput = z.output<typeof customerFormSchema>;

export type CustomerRow = {
  id: string; status: CustomerStatus; source: "manual" | "web_form";
  first_name: string; last_name: string; company_name: string;
  email: string | null; phone: string | null; secondary_phone: string | null;
  service_address: string | null; billing_address: string | null; city: string | null; state: string | null; zip_code: string | null;
  property_type: string | null; square_footage: number | null; bedrooms: number | null; bathrooms: number | null;
  cleaning_frequency: string | null; preferred_service: string | null; estimated_price_cents: number | null;
  access_instructions: string | null; pets: string | null; special_instructions: string | null; notes: string | null;
  customer_since: string | null; converted_at: string | null; created_at: string;
};

export function displayName(c: Pick<CustomerRow, "first_name" | "last_name" | "company_name">): string {
  const person = `${c.first_name} ${c.last_name}`.trim();
  return person || c.company_name;
}

/** Where a restored/reactivated customer goes: back to what they were before. */
export function restoredStatus(c: Pick<CustomerRow, "converted_at">): CustomerStatus {
  return c.converted_at ? "active" : "prospect";
}
