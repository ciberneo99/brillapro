import { parseCsv } from "@/modules/venmo/parse";
import { centsToInput, type CustomerRow } from "./schema";

/** The columns of the customers CSV, in order. The same list builds the template, the export and the import. */
export const CSV_COLUMNS = [
  { key: "first_name", label: "First Name", aliases: ["firstname", "first", "name"] },
  { key: "last_name", label: "Last Name", aliases: ["lastname", "last", "surname"] },
  { key: "company_name", label: "Company", aliases: ["companyname", "business"] },
  { key: "email", label: "Email", aliases: ["emailaddress"] },
  { key: "phone", label: "Phone", aliases: ["phonenumber", "mobile", "cell"] },
  { key: "secondary_phone", label: "Secondary Phone", aliases: ["phone2", "secondphone", "otherphone"] },
  { key: "service_address", label: "Address", aliases: ["serviceaddress", "street", "streetaddress"] },
  { key: "city", label: "City", aliases: [] },
  { key: "state", label: "State", aliases: [] },
  { key: "zip_code", label: "ZIP", aliases: ["zipcode", "postalcode", "postal"] },
  { key: "property_type", label: "Property Type", aliases: ["propertytype", "type"] },
  { key: "square_footage", label: "Sq. Footage", aliases: ["squarefootage", "sqft", "sqfootage", "squarefeet"] },
  { key: "bedrooms", label: "Bedrooms", aliases: ["beds", "bedroom"] },
  { key: "bathrooms", label: "Bathrooms", aliases: ["baths", "bathroom"] },
  { key: "cleaning_frequency", label: "Frequency", aliases: ["cleaningfrequency"] },
  { key: "estimated_price", label: "Estimated Price", aliases: ["price", "estimatedprice"] },
  { key: "pets", label: "Pets", aliases: [] },
  { key: "access_instructions", label: "Access Instructions", aliases: ["access", "accessinstructions"] },
  { key: "special_instructions", label: "Special Instructions", aliases: ["instructions", "specialinstructions"] },
  { key: "notes", label: "Notes", aliases: ["note", "internalnotes"] },
  { key: "customer_since", label: "Customer Since", aliases: ["since", "clientsince", "customersince"] },
  { key: "rating", label: "Rating", aliases: ["stars"] },
  { key: "status", label: "Status", aliases: [] },
] as const;

export type CsvKey = (typeof CSV_COLUMNS)[number]["key"];
export const CSV_LABELS = Object.fromEntries(CSV_COLUMNS.map((c) => [c.key, c.label])) as Record<CsvKey, string>;
export const IMPORT_MAX_ROWS = 1000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const HEADER_TO_KEY = new Map<string, CsvKey>();
for (const c of CSV_COLUMNS) for (const n of [c.key, c.label, ...c.aliases]) HEADER_TO_KEY.set(norm(n), c.key);

const PROPERTY_ALIASES: Record<string, string> = {
  house: "house", apartment: "apartment", condo: "condo", townhouse: "townhouse", office: "office",
  commercial: "commercial", commercialspace: "commercial", other: "other",
};
const FREQUENCY_ALIASES: Record<string, string> = {
  onetime: "one_time", once: "one_time", weekly: "weekly", biweekly: "biweekly", everytwoweeks: "biweekly", everyotherweek: "biweekly",
  monthly: "monthly", everyfourweeks: "every_four_weeks", custom: "custom",
};
const STATUS_ALIASES: Record<string, ImportStatus> = {
  prospect: "prospect", lead: "prospect", active: "active", activecustomer: "active", inactive: "inactive", inactivecustomer: "inactive",
};
export type ImportStatus = "prospect" | "active" | "inactive";

/** M/D/YYYY (what Excel writes in the US) → YYYY-MM-DD. Anything else is left for the schema to judge. */
function normalizeDate(v: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : v;
}

function cleanValue(key: CsvKey, raw: string): string {
  // The export prefixes ' to cells that start with = + - @ ; undo it.
  let v = raw.replace(/^'(?=[=+\-@])/, "").trim();
  if (v === "") return "";
  if (key === "property_type") return PROPERTY_ALIASES[norm(v)] ?? v;
  if (key === "cleaning_frequency") return FREQUENCY_ALIASES[norm(v)] ?? v;
  if (key === "customer_since") return normalizeDate(v);
  if (key === "estimated_price") v = v.replace(/[$\s]/g, "");
  return v;
}

export type ImportRow = { line: number; values: Partial<Record<CsvKey, string>>; status: ImportStatus | null };
export type ReadResult = { rows: ImportRow[] } | { error: "empty" | "noHeaders" | "tooMany" };

/** Reads a customers CSV: finds the columns by their titles (any order, extras ignored) and tidies each value. */
export function readCustomersCsv(text: string): ReadResult {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  // Excel in many countries saves with ";" instead of ",".
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const table = parseCsv(clean, delimiter).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length === 0) return { error: "noHeaders" };

  const keys = table[0].map((h) => HEADER_TO_KEY.get(norm(h)) ?? null);
  if (!keys.some((k) => k === "first_name" || k === "last_name" || k === "company_name")) return { error: "noHeaders" };
  if (table.length === 1) return { error: "empty" };
  if (table.length - 1 > IMPORT_MAX_ROWS) return { error: "tooMany" };

  const rows: ImportRow[] = table.slice(1).map((cells, i) => {
    const values: Partial<Record<CsvKey, string>> = {};
    let status: ImportStatus | null = null;
    keys.forEach((k, col) => {
      if (!k || values[k] !== undefined) return; // first column with that title wins
      const v = cleanValue(k, cells[col] ?? "");
      if (k === "status") status = STATUS_ALIASES[norm(v)] ?? null;
      else values[k] = v;
    });
    return { line: i + 2, values, status };
  });
  return { rows };
}

/** One CSV line. Cells that start with a formula character are neutralised so a spreadsheet won't run them. */
function csvLine(cells: string[]): string {
  return cells
    .map((s) => {
      const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
      return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    })
    .join(",");
}

const build = (lines: string[][]) => "﻿" + lines.map(csvLine).join("\r\n") + "\r\n";

/** Header row plus two made-up examples that show the accepted formats. */
export function customersTemplateCsv(): string {
  const example = (v: Partial<Record<CsvKey, string>>) => CSV_COLUMNS.map((c) => v[c.key] ?? "");
  return build([
    CSV_COLUMNS.map((c) => c.label),
    example({ first_name: "Jane", last_name: "Example", email: "jane.example@example.com", phone: "555-123-4567", service_address: "123 Main St", city: "Springfield", state: "IL", zip_code: "62701", property_type: "House", square_footage: "1800", bedrooms: "3", bathrooms: "2.5", cleaning_frequency: "Every two weeks", estimated_price: "150.00", pets: "1 dog", notes: "Prefers mornings", customer_since: "2025-01-15", rating: "5", status: "Active" }),
    example({ company_name: "Example Dental Office", email: "office@example.com", phone: "555-987-6543", service_address: "45 Oak Ave", city: "Springfield", state: "IL", zip_code: "62704", property_type: "Office", square_footage: "2400", cleaning_frequency: "Weekly", status: "Prospect" }),
  ]);
}

export function customersToCsv(rows: CustomerRow[]): string {
  const cell = (c: CustomerRow, key: CsvKey): string => {
    if (key === "estimated_price") return centsToInput(c.estimated_price_cents);
    const v = (c as unknown as Record<string, unknown>)[key];
    return v == null ? "" : String(v);
  };
  return build([CSV_COLUMNS.map((c) => c.label), ...rows.map((r) => CSV_COLUMNS.map((c) => cell(r, c.key)))]);
}
