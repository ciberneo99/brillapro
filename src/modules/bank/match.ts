/** How many days apart a receipt's date and the bank's posting date may be (cards post a few days after the purchase). */
export const MATCH_DAYS = 5;

export type MatchTx = { id: string; tx_date: string; amount_cents: number };
export type MatchExpense = { id: string; expense_date: string; amount_cents: number };

const day = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** Expenses that could be the same purchase as a bank withdrawal: same amount, dates close. Closest date first. */
export function candidatesFor(tx: MatchTx, expenses: MatchExpense[]): MatchExpense[] {
  if (tx.amount_cents >= 0) return [];
  return expenses
    .map((e) => ({ e, gap: Math.abs(day(e.expense_date) - day(tx.tx_date)) }))
    .filter((x) => x.e.amount_cents === -tx.amount_cents && x.gap <= MATCH_DAYS)
    .sort((a, b) => a.gap - b.gap)
    .map((x) => x.e);
}

/** Pairs that are safe to link without asking: the withdrawal has exactly one candidate and that expense has exactly one withdrawal. */
export function autoPairs(txs: MatchTx[], expenses: MatchExpense[]): { txId: string; expenseId: string }[] {
  const options = new Map(txs.map((t) => [t.id, candidatesFor(t, expenses)] as const));
  const claims = new Map<string, number>();
  for (const list of options.values()) for (const e of list) claims.set(e.id, (claims.get(e.id) ?? 0) + 1);
  const out: { txId: string; expenseId: string }[] = [];
  for (const [txId, list] of options) if (list.length === 1 && claims.get(list[0].id) === 1) out.push({ txId, expenseId: list[0].id });
  return out;
}
