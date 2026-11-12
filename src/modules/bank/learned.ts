import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { merchantKey, pickLearned } from "./learn";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Rule = { pattern: string; category_id: string; hits: number };

async function rulesFor(supabase: Supabase, patterns: string[]): Promise<Rule[]> {
  const out: Rule[] = [];
  for (let i = 0; i < patterns.length; i += 100) {
    const { data } = await supabase.from("bank_learned_rules").select("pattern,category_id,hits").in("pattern", patterns.slice(i, i + 100));
    out.push(...((data ?? []) as Rule[]));
  }
  return out;
}

/** For each description, the category the company has chosen for that merchant before (or nothing). */
export async function learnedCategories(supabase: Supabase, descriptions: string[]): Promise<(string | null)[]> {
  const keys = descriptions.map(merchantKey);
  const rules = await rulesFor(supabase, [...new Set(keys.filter((k): k is string => !!k))]);
  const byPattern = new Map<string, { category_id: string; hits: number }[]>();
  for (const r of rules) byPattern.set(r.pattern, [...(byPattern.get(r.pattern) ?? []), r]);
  return keys.map((k) => (k ? pickLearned(byPattern.get(k) ?? []) : null));
}

/**
 * Remembers the category the person picked for each line. A correction (`from`) also takes one vote away from the category it replaces,
 * so a wrong guess is overruled by a single fix.
 */
export async function learnChoices(supabase: Supabase, tenantId: string, choices: { description: string; to: string; from?: string | null }[]) {
  const delta = new Map<string, { pattern: string; category_id: string; d: number }>();
  const bump = (pattern: string, category_id: string, d: number) => {
    const k = `${pattern}|${category_id}`;
    delta.set(k, { pattern, category_id, d: (delta.get(k)?.d ?? 0) + d });
  };
  for (const c of choices) {
    const pattern = merchantKey(c.description);
    if (!pattern || c.to === c.from) continue;
    bump(pattern, c.to, 1);
    if (c.from) bump(pattern, c.from, -1);
  }
  if (!delta.size) return;
  const current = new Map((await rulesFor(supabase, [...new Set([...delta.values()].map((x) => x.pattern))])).map((r) => [`${r.pattern}|${r.category_id}`, r.hits]));
  const upserts: { tenant_id: string; pattern: string; category_id: string; hits: number; updated_at: string }[] = [];
  for (const [k, x] of delta) {
    const hits = (current.get(k) ?? 0) + x.d;
    if (hits > 0) upserts.push({ tenant_id: tenantId, pattern: x.pattern, category_id: x.category_id, hits, updated_at: new Date().toISOString() });
    else if (current.has(k)) await supabase.from("bank_learned_rules").delete().eq("tenant_id", tenantId).eq("pattern", x.pattern).eq("category_id", x.category_id);
  }
  if (upserts.length) await supabase.from("bank_learned_rules").upsert(upserts, { onConflict: "tenant_id,pattern,category_id" });
}
