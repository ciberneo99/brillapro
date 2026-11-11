// Turns the text of a bank statement PDF into transactions. Pure code, no network: statements never leave the server.
// Bank layouts differ, so this reads the common shape (a date, a description, an amount and often a running balance)
// and the person reviews the result before anything is saved.

export type ParsedTx = { date: string; description: string; amountCents: number; balanceCents: number | null };
export type StatementSummary = { beginningCents: number | null; endingCents: number | null; periodStart: string | null; periodEnd: string | null };
export type ParsedStatement = { transactions: ParsedTx[]; year: number; summary: StatementSummary };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONEY = /(?:^|\s)(-?\(?\$?\s?-?\d{1,3}(?:,\d{3})*\.\d{2}\)?-?)\s*(?:CR|DR)?$/i;
const NUMERIC_DATE = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s|$)/;
const NAMED_DATE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?(?=\s|$)/i;
const SKIP = /^(total|subtotal|page\s+\d|continued|statement period|account number|beginning balance|opening balance|previous balance|ending balance|closing balance)/i;

/** "$1,234.56" → 123456, "(45.00)" or "-45.00" or "45.00-" → -4500. Null when it isn't an amount. */
export function parseMoney(input: string): number | null {
  const s = input.trim();
  const neg = /^\(.*\)$/.test(s) || s.includes("-") || /DR$/i.test(s);
  const m = /(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})/.exec(s);
  if (!m) return null;
  const cents = Number(m[1].replace(/,/g, "")) * 100 + Number(m[2]);
  return neg ? -cents : cents;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Finds the statement year from the header text ("January 1, 2026", "01/31/2026"); falls back to the given year. */
export function detectYear(lines: string[], fallback: number): number {
  const head = lines.slice(0, 60).join(" ");
  const m = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+(20\d{2})\b/i.exec(head) ?? /\b\d{1,2}\/\d{1,2}\/(20\d{2})\b/.exec(head) ?? /\b(20\d{2})\b/.exec(head);
  return m ? Number(m[1]) : fallback;
}

function readDate(line: string, year: number): { date: string; rest: string } | null {
  const n = NUMERIC_DATE.exec(line);
  if (n) {
    let y = n[3] ? Number(n[3]) : year;
    if (y < 100) y += 2000;
    const date = iso(y, Number(n[1]), Number(n[2]));
    return date ? { date, rest: line.slice(n[0].length).trim() } : null;
  }
  const w = NAMED_DATE.exec(line);
  if (w) {
    const date = iso(w[3] ? Number(w[3]) : year, MONTHS.indexOf(w[1].toLowerCase()) + 1, Number(w[2]));
    return date ? { date, rest: line.slice(w[0].length).trim() } : null;
  }
  return null;
}

type Section = "auto" | "in" | "out" | "skip";
const sectionOf = (line: string): Section | null => {
  if (line.length > 70 || MONEY.test(line)) return null;
  if (/daily (ending )?balance|balance summary/i.test(line)) return "skip";
  if (/deposits|credits|additions/i.test(line)) return "in";
  if (/withdrawals|debits|checks paid|subtractions|fees and charges|payments and purchases/i.test(line)) return "out";
  if (/transaction (detail|history)|account activity|activity detail/i.test(line)) return "auto";
  return null;
};

const BEGIN = /(?:beginning|opening|previous) balance.*?(-?\$?\s?\d[\d,]*\.\d{2})/i;
const END = /(?:ending|closing|new) balance.*?(-?\$?\s?\d[\d,]*\.\d{2})/i;
const DATE_TEXT = String.raw`(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}/\d{1,2}/\d{2,4})`;
const RANGE = new RegExp(`(${DATE_TEXT})\\s*(?:through|thru|to|-|–)\\s*(${DATE_TEXT})`, "i");

/** The statement's own period, from a header like "January 1, 2026 through January 31, 2026". */
export function detectPeriod(lines: string[], year: number): { start: string; end: string } | null {
  for (const line of lines.slice(0, 80)) {
    const m = RANGE.exec(line);
    if (!m) continue;
    const a = readDate(m[1].replace(/,/g, ""), year);
    const b = readDate(m[2].replace(/,/g, ""), year);
    if (a && b && a.date <= b.date) return { start: a.date, end: b.date };
  }
  return null;
}

// Words that say which way the money moved. Expense words win, so "Deposited OR Cashed Check" (a check you wrote) is a withdrawal.
const EXPENSE_WORDS = /\b(purchase authorized|recurring payment|deposited or cashed|monthly service fee|service fee|zelle to|withdrawal|atm|debit card|overdraft|transfer to|bill pay|autopay|auto pay|payment to|pos purchase)\b/i;
const INCOME_WORDS = /\b(zelle from|mobile deposit|deposit|venmo cashout|refund|interest|transfer from|payment from|credit|cashback|reversal|direct dep)\b/i;
// Text from neighbouring tables of the page that ends up on the same line as a transaction.
const JUNK = /\s+(?:number date amount|date check number|check number description|ending daily balance|deposits\/credits|withdrawals\/debits)\b.*$/i;

const tidy = (d: string) => d.replace(JUNK, "").replace(/\s+/g, " ").trim().slice(0, 300);

/** +1 money in, -1 money out, 0 when the words do not say. */
export function directionHint(description: string): 1 | -1 | 0 {
  if (EXPENSE_WORDS.test(description)) return -1;
  if (INCOME_WORDS.test(description)) return 1;
  return 0;
}

type RawTx = { date: string; description: string; abs: number; negative: boolean; section: Section; balance: number | null };

/**
 * Decides which rows are deposits and which are withdrawals. A statement prints one amount column in text, so the sign comes from
 * (1) the running balance: between two balances the signed amounts must add up to the balance change, and the choice that
 * agrees most with the words ("Zelle from", "Purchase authorized") wins; (2) section headings; (3) the words alone.
 * Anything unclear is treated as an expense.
 */
function resolveSigns(raw: RawTx[], beginning: number | null): ParsedTx[] {
  const hint = (r: RawTx): 1 | -1 | 0 => (r.negative ? -1 : r.section === "in" ? 1 : r.section === "out" ? -1 : directionHint(r.description));
  const signs: (1 | -1)[] = raw.map((r) => (hint(r) === 1 ? 1 : -1));

  let prev = beginning;
  let start = 0;
  raw.forEach((r, i) => {
    if (r.balance === null) return;
    const group = raw.slice(start, i + 1);
    if (prev !== null && group.length <= 14) {
      const delta = r.balance - prev;
      let best: { mask: number; cost: number } | null = null;
      for (let mask = 0; mask < 1 << group.length; mask++) {
        let sum = 0, cost = 0, ok = true;
        for (let k = 0; k < group.length && ok; k++) {
          const plus = (mask >> k) & 1;
          if (group[k].negative && plus) { ok = false; break; }
          sum += plus ? group[k].abs : -group[k].abs;
          const h = hint(group[k]);
          cost += h === 0 ? (plus ? 0.2 : 0) : (h === 1) === Boolean(plus) ? 0 : 3;
        }
        if (ok && sum === delta && (!best || cost < best.cost)) best = { mask, cost };
      }
      if (best) group.forEach((_, k) => { signs[start + k] = (best!.mask >> k) & 1 ? 1 : -1; });
    }
    prev = r.balance;
    start = i + 1;
  });

  return raw.map((r, i) => ({ date: r.date, description: tidy(r.description), amountCents: signs[i] * r.abs, balanceCents: r.balance }));
}

export function parseStatement(text: string, fallbackYear = new Date().getFullYear()): ParsedStatement {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const year = detectYear(lines, fallbackYear);
  const out: RawTx[] = [];
  let section: Section = "auto";
  let pending: { date: string; description: string } | null = null;
  let beginning: number | null = null;
  let ending: number | null = null;

  const finish = (date: string, description: string, amountToken: string, balanceToken: string | null) => {
    const amount = parseMoney(amountToken);
    if (amount === null || amount === 0) return;
    out.push({ date, description, abs: Math.abs(amount), negative: amount < 0, section, balance: balanceToken ? parseMoney(balanceToken) : null });
  };

  for (const line of lines) {
    const begin = BEGIN.exec(line);
    if (begin) { if (beginning === null) beginning = parseMoney(begin[1]); continue; }
    const end = END.exec(line);
    if (end && !/^daily/i.test(line)) { if (ending === null) ending = parseMoney(end[1]); continue; }

    const dated = readDate(line, year);
    if (!dated) {
      const sec = sectionOf(line);
      if (sec) { section = sec; pending = null; continue; }
      if (pending) {
        // A wrapped description: the amount may arrive on this line.
        const m = MONEY.exec(line);
        if (m && !SKIP.test(line)) {
          const before = line.slice(0, m.index).trim();
          const two = MONEY.exec(before);
          const desc = [pending.description, two ? before.slice(0, two.index).trim() : before].filter(Boolean).join(" ");
          if (section !== "skip") finish(pending.date, desc, two ? two[1] : m[1], two ? m[1] : null);
          pending = null;
        } else if (!SKIP.test(line) && line.length < 90) pending.description += ` ${line}`;
      } else if (out.length && section !== "skip" && !SKIP.test(line) && !MONEY.test(line) && line.length < 80 && !JUNK.test(` ${line}`) && !sectionOf(line)) {
        const last = out[out.length - 1];
        if (last.description.length + line.length < 300) last.description += ` ${line}`;
      }
      continue;
    }
    if (section === "skip" && !/deposit|withdraw|debit|credit/i.test(dated.rest)) continue;
    if (SKIP.test(dated.rest)) continue;

    let rest = dated.rest;
    const last = MONEY.exec(rest);
    if (!last) { pending = { date: dated.date, description: rest }; continue; }
    rest = rest.slice(0, last.index).trim();
    const second = MONEY.exec(rest);
    const description = second ? rest.slice(0, second.index).trim() : rest;
    pending = null;
    if (!description) continue;
    if (section === "skip") continue;
    finish(dated.date, description, second ? second[1] : last[1], second ? last[1] : null);
  }
  const period = detectPeriod(lines, year);
  return { transactions: resolveSigns(out, beginning), year, summary: { beginningCents: beginning, endingCents: ending, periodStart: period?.start ?? null, periodEnd: period?.end ?? null } };
}

/**
 * Picks the subcategory whose keywords appear in the description (the longest match wins).
 * With a direction, deposits only get categories under "Income" and withdrawals never do.
 */
export function suggestCategory(description: string, categories: { id: string; keywords: string; income?: boolean }[], deposit?: boolean): string | null {
  const d = description.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const c of categories) {
    if (deposit !== undefined && c.income !== undefined && c.income !== deposit) continue;
    for (const k of c.keywords.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
      if (d.includes(k) && (!best || k.length > best.len)) best = { id: c.id, len: k.length };
    }
  }
  return best?.id ?? null;
}

/** A stable key so importing the same statement twice does not duplicate rows. `n` counts identical lines in one file. */
export function dedupeInput(t: ParsedTx, n: number): string {
  return `${t.date}|${t.description.toLowerCase()}|${t.amountCents}|${t.balanceCents ?? ""}|${n}`;
}
