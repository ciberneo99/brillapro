import { describe, expect, it } from "vitest";
import { customersTemplateCsv, customersToCsv, readCustomersCsv } from "@/modules/customers/csv";
import { customerFormSchema, type CustomerRow } from "@/modules/customers/schema";

const parse = (text: string) => {
  const r = readCustomersCsv(text);
  if ("error" in r) throw new Error(r.error);
  return r.rows;
};

describe("customers CSV", () => {
  it("reads the template it generates, and every example row passes the customer schema", () => {
    const rows = parse(customersTemplateCsv());
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(customerFormSchema.safeParse(r.values).success).toBe(true);
    expect(rows[0].status).toBe("active");
    expect(rows[1].status).toBe("prospect");
    expect(customerFormSchema.parse(rows[0].values)).toMatchObject({ property_type: "house", cleaning_frequency: "biweekly", estimated_price_cents: 15000, bathrooms: 2.5 });
  });

  it("accepts titles in any order, semicolons, friendly values and US dates", () => {
    const rows = parse("Email;Last Name;Frequency;Customer Since;Property Type\r\nA@B.com;Lopez;Every four weeks;3/9/2025;Commercial space\r\n");
    expect(rows[0].values).toMatchObject({ cleaning_frequency: "every_four_weeks", customer_since: "2025-03-09", property_type: "commercial" });
    expect(customerFormSchema.parse(rows[0].values).email).toBe("a@b.com");
  });

  it("rejects files without column titles, or without rows", () => {
    expect(readCustomersCsv("foo,bar\r\n1,2")).toEqual({ error: "noHeaders" });
    expect(readCustomersCsv("First Name,Email\r\n")).toEqual({ error: "empty" });
  });

  it("export round-trips through import and neutralises formulas", () => {
    const row = { first_name: "Ana", last_name: "=cmd", email: "ana@x.com", status: "active", estimated_price_cents: 12050 } as unknown as CustomerRow;
    const csv = customersToCsv([row]);
    expect(csv).toContain("'=cmd");
    const back = parse(csv)[0];
    expect(back.values.last_name).toBe("=cmd");
    expect(back.values.estimated_price).toBe("120.50");
  });
});
