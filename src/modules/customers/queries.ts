import "server-only";
import { createClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/phone";
import { STATUSES, type CustomerRow, type CustomerStatus } from "./schema";

export const PAGE_SIZE = 25;
export const SORTS = ["newest", "oldest", "name"] as const;
export type Sort = (typeof SORTS)[number];

const COLUMNS =
  "id,status,source,first_name,last_name,company_name,email,phone,secondary_phone,service_address,billing_address,city,state,zip_code," +
  "property_type,square_footage,bedrooms,bathrooms,cleaning_frequency,preferred_service,estimated_price_cents,access_instructions," +
  "pets,special_instructions,notes,customer_since,rating,converted_at,created_at";

/** Characters with meaning in PostgREST filters / LIKE are removed from the search term. */
function cleanSearch(q: string): string {
  return q.replace(/[%_\\,()*:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export type ListParams = { q?: string; status?: string; sort?: string; page?: number };

export async function listCustomers(params: ListParams) {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const sort: Sort = (SORTS as readonly string[]).includes(params.sort ?? "") ? (params.sort as Sort) : "newest";
  const status = (STATUSES as readonly string[]).includes(params.status ?? "") ? (params.status as CustomerStatus) : null;
  const q = cleanSearch(params.q ?? "");

  let query = supabase.from("customers").select(COLUMNS, { count: "exact" });
  // "All" hides archived records; archived has its own filter.
  query = status ? query.eq("status", status) : query.neq("status", "archived");
  if (q) {
    const like = `%${q}%`;
    const conditions = ["first_name", "last_name", "company_name", "email", "phone", "secondary_phone"].map((c) => `${c}.ilike.${like}`);
    // Phones are stored as xxx-xxx-xxxx, so a search typed as digits must match that format too.
    if (/^[ds().+-]{3,}$/.test(q)) {
      const formatted = `%${formatPhone(q)}%`;
      conditions.push(`phone.ilike.${formatted}`, `secondary_phone.ilike.${formatted}`);
    }
    query = query.or(conditions.join(","));
  }
  query =
    sort === "name"
      ? query.order("last_name", { ascending: true }).order("first_name", { ascending: true }).order("company_name", { ascending: true })
      : query.order("created_at", { ascending: sort === "oldest" });

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("customers query failed");
  return { rows: (data ?? []) as unknown as CustomerRow[], total: count ?? 0, page, pages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)), sort, status, q };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getCustomer(id: string): Promise<CustomerRow | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select(COLUMNS).eq("id", id).maybeSingle();
  return (data as unknown as CustomerRow) ?? null;
}

export type CustomerEvent = { id: number; type: string; metadata: Record<string, string>; created_at: string; actor_name: string | null };

export async function getCustomerEvents(id: string): Promise<CustomerEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_events")
    .select("id,type,metadata,created_at,actor:profiles(full_name)")
    .eq("customer_id", id)
    .order("id", { ascending: false })
    .limit(100);
  return (data ?? []).map((e) => {
    const actor = Array.isArray(e.actor) ? e.actor[0] : e.actor;
    return { id: e.id, type: e.type, metadata: (e.metadata ?? {}) as Record<string, string>, created_at: e.created_at, actor_name: actor?.full_name || null };
  });
}

/** Another record in the same account with the same e-mail (RLS keeps this inside the tenant). */
export async function hasDuplicateEmail(id: string, email: string | null): Promise<boolean> {
  if (!email) return false;
  const supabase = await createClient();
  const { count } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .ilike("email", email.replace(/[%_\\]/g, ""))
    .neq("id", id)
    .neq("status", "archived");
  return (count ?? 0) > 0;
}

export async function countActiveCustomers(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "active");
  return count ?? 0;
}
