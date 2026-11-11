// Starts a report from the bank's own previous balance and checks it against the bank's ending balance. Pure code.

export type StatementBalances = { period_start: string; period_end: string; beginning_balance_cents: number | null; ending_balance_cents: number | null };

export type BalanceSummary = {
  /** The bank's balance at the start of the period. */
  previousCents: number;
  depositsCents: number;
  withdrawalsCents: number;
  /** Previous balance + deposits - withdrawals: what the imported transactions add up to. */
  endingCents: number;
  /** The ending balance printed on the bank statement, when known. */
  bankEndingCents: number | null;
  /** Bank ending balance minus the computed one. Zero means the report matches the bank. */
  differenceCents: number | null;
};

/**
 * `month` ("YYYY-MM") picks the statements that end in that month; without it every statement is used, oldest first.
 * Returns null when there is no statement with a previous balance to start from.
 */
export function balanceSummary(statements: StatementBalances[], month: string | undefined, depositsCents: number, withdrawalsCents: number): BalanceSummary | null {
  const picked = statements
    .filter((s) => !month || s.period_end.slice(0, 7) === month)
    .sort((a, b) => a.period_start.localeCompare(b.period_start));
  if (picked.length === 0) return null;
  const previous = picked[0].beginning_balance_cents;
  if (previous === null) return null;
  const endingCents = previous + depositsCents - withdrawalsCents;
  const bankEndingCents = picked[picked.length - 1].ending_balance_cents;
  return { previousCents: previous, depositsCents, withdrawalsCents, endingCents, bankEndingCents, differenceCents: bankEndingCents === null ? null : bankEndingCents - endingCents };
}
