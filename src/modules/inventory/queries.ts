import "server-only";
import { createClient } from "@/lib/supabase/server";

export type InventoryItem = {
  id: string; name: string; unit: string; min_quantity: number; unit_cost_cents: number | null; notes: string | null;
  is_active: boolean; on_hand: number; is_low: boolean;
};

const COLS = "id,name,unit,min_quantity,unit_cost_cents,notes,is_active,on_hand,is_low";
const norm = (r: Record<string, unknown>): InventoryItem => ({
  ...(r as unknown as InventoryItem), min_quantity: Number(r.min_quantity), on_hand: Number(r.on_hand), is_low: Boolean(r.is_low),
});

export async function listItems(opts: { showInactive?: boolean } = {}): Promise<InventoryItem[]> {
  const supabase = await createClient();
  let q = supabase.from("inventory_overview").select(COLS).order("name");
  if (!opts.showInactive) q = q.eq("is_active", true);
  const { data } = await q.limit(1000);
  return (data ?? []).map(norm);
}

export async function getItem(id: string): Promise<InventoryItem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("inventory_overview").select(COLS).eq("id", id).maybeSingle();
  return data ? norm(data) : null;
}

export type Movement = { id: string; kind: string; quantity: number; note: string | null; movement_date: string; job_title: string | null };

export async function listMovements(itemId: string): Promise<Movement[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_movements")
    .select("id,kind,quantity,note,movement_date,jobs(title)")
    .eq("item_id", itemId).order("movement_date", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  return (data ?? []).map((m) => ({
    id: m.id, kind: m.kind, quantity: Number(m.quantity), note: m.note, movement_date: m.movement_date,
    job_title: (m.jobs as unknown as { title: string } | null)?.title ?? null,
  }));
}
