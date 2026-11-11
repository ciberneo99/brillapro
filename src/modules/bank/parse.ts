// Turns the text of a bank statement PDF into transactions. Pure code, no network: statements never leave the server.
// Bank layouts differ, so this reads the common shape (a date, a description, an amount and often a running balance)
// and the person reviews the result before anything is saved.

export type ParsedTx = { date: string; description: string; amountCents: number; balanceCents: number | null };
export type ParsedStatement = { transactions: ParsedTx[]; year: number };

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

const INCOME_WORDS = /\b(deposit|credit|refund|interest|zelle (payment )?from|payment from|venmo cashout|transfer from|received)\b/i;

export function parseStatement(text: string, fallbackYear = new Date().getFullYear()): ParsedStatement {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const year = detectYear(lines, fallbackYear);
  const out: ParsedTx[] = [];
  let section: Section = "auto";
  let prevBalance: number | null = null;
  let pending: { date: string; description: string } | null = null;

  const finish = (date: string, description: string, amountToken: string, balanceToken: string | null) => {
    const raw = parseMoney(amountToken);
    if (raw === null || raw === 0) return;
    const balance = balanceToken ? parseMoney(balanceToken) : null;
    const abs = Math.abs(raw);
    let signed: number;
    if (raw < 0) signed = -abs;
    else if (balance !== null && prevBalance !== null && (balance === prevBalance + abs || balance === prevBalance - abs)) signed = balance === prevBalance + abs ? abs : -abs;
    else if (section === "in") signed = abs;
    else if (section === "out") signed = -abs;
    else signed = INCOME_WORDS.test(description) ? abs : -abs;
    if (balance !== null) prevBalance = balance;
    out.push({ date, description: description.slice(0, 300), amountCents: signed, balanceCents: balance });
  };

  for (const line of lines) {
    const begin = /(?:beginning|opening|previous) balance.*?(-?\$?\d[\d,]*\.\d{2})/i.exec(line);
    if (begin) { prevBalance = parseMoney(begin[1]); continue; }

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
      } else if (out.length && section !== "skip" && !SKIP.test(line) && !MONEY.test(line) && line.length < 80 && !sectionOf(line)) {
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
  return { transactions: out, year };
}

/** Picks the subcategory whose keywords appear in the description (the longest match wins). */
export function suggestCategory(description: string, categories: { id: string; keywords: string }[]): string | null {
  const d = description.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const c of categories) {
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
