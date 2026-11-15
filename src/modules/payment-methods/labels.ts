/** Payment methods as the company edits them. `code` is what payments / expenses store. Safe to import from client code. */
export type PaymentMethod = { code: string; name: string; is_active: boolean };

export const BUILTIN_METHODS = ["cash", "check", "card", "zelle", "venmo", "bank_transfer", "other"] as const;

/** The company's name for a method; the built-in translation when it has no row, and the raw code as a last resort. */
export function methodName(list: PaymentMethod[], code: string, builtin?: (code: string) => string): string {
  const row = list.find((m) => m.code === code);
  if (row) return row.name;
  return builtin && (BUILTIN_METHODS as readonly string[]).includes(code) ? builtin(code) : code;
}

/** Choices for a drop-down: the active methods, plus the one already chosen even if it was hidden since. */
export function methodChoices(list: PaymentMethod[], current?: string | null): PaymentMethod[] {
  return list.filter((m) => m.is_active || m.code === current);
}
