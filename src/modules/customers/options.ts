import { displayName } from "./schema";

export const CUSTOMER_OPTION_COLUMNS = "id,first_name,last_name,company_name,email,phone,billing_address,service_address,city,state,zip_code";

type Row = Parameters<typeof displayName>[0] & {
  id: string; email: string | null; phone: string | null; billing_address: string | null; service_address: string | null;
  city: string | null; state: string | null; zip_code: string | null;
};

/** Rows from CUSTOMER_OPTION_COLUMNS -> what the customer search box needs. */
export function toCustomerOptions(rows: Row[]) {
  return rows.map((c) => ({
    id: c.id, name: displayName(c), email: c.email, phone: c.phone, company: c.company_name || null,
    address: [c.billing_address || c.service_address, c.city, [c.state, c.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
  }));
}
