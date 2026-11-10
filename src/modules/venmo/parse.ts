// Reads a Venmo account statement (CSV) and builds an organized report. Pure code: every total is computed here,
// so the numbers are exact and repeatable. Nothing is stored.
import { startOfWeek, todayIso } from "@/lib/calendar";
import { normalizeName } from "@/lib/text";

/** Minimal RFC 4180 reader: quoted fields, escaped quotes and line breaks inside quotes. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** "+ $135.00" → 13500, "- $1,000.00" → -100000, "$62.00" → 6200. Anything else → null. */
export function parseVenmoAmount(input: string | null | undefined): number | null {
  const m = /^\s*([+-])?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*$/.exec(input ?? "");
  if (!m) return null;
  const cents = Math.round(Number(m[2].replace(/,/g, "")) * 100);
  return m[1] === "-" ? -cents : cents;
}

export type VenmoKind = "received" | "sent" | "transfer";
export type VenmoTx = {
  id: string; date: string; type: string; status: string; note: string; counterparty: string; amount_cents: number; fee_cents: number; kind: VenmoKind;
};
export type Group = { name: string; count: number; cents: number };
export type VenmoReport = {
  account: string | null;
  from: string | null; to: string | null;
  beginning_cents: number | null; ending_cents: number | null;
  received: { cents: number; count: number }; sent: { cents: number; count: number }; transfers: { cents: number; count: number };
  fees_cents: number;
  /** Beginning balance + movements − ending balance, in cents (0 = the statement adds up). Null when the balances are missing. */
  difference_cents: number | null;
  byClient: Group[]; byWeek: Group[]; transactions: VenmoTx[];
  excluded: number;
};

export type ParseResult = { ok: true; report: VenmoReport } | { ok: false; error: "empty" | "format" | "tooBig" };

const COUNTED = new Set(["complete", "completed", "issued"]);
const MAX_ROWS = 5000;

export function buildVenmoReport(csv: string, timeZone = "America/New_York"): ParseResult {
  const rows = parseCsv(csv);
  if (rows.length === 0 || csv.trim() === "") return { ok: false, error: "empty" };
  if (rows.length > MAX_ROWS) return { ok: false, error: "tooBig" };

  const headerAt = rows.findIndex((r) => r.includes("Datetime") && r.includes("Amount (total)"));
  if (headerAt === -1) return { ok: false, error: "format" };
  const col = Object.fromEntries(rows[headerAt].map((h, i) => [h.trim(), i])) as Record<string, number>;
  const cell = (r: string[], name: string) => (col[name] === undefined ? "" : (r[col[name]] ?? "").trim());

  const accountMatch = /\((@[^)]+)\)/.exec(rows[0]?.[0] ?? "");
  const data = rows.slice(headerAt + 1);

  let beginning: number | null = null;
  let ending: number | null = null;
  const raw: { r: string[]; cents: number }[] = [];
  for (const r of data) {
    const b = parseVenmoAmount(cell(r, "Beginning Balance"));
    const e = parseVenmoAmount(cell(r, "Ending Balance"));
    if (b !== null && beginning === null) beginning = b;
    if (e !== null) ending = e;
    if (!cell(r, "ID") || !cell(r, "Datetime")) continue;
    const cents = parseVenmoAmount(cell(r, "Amount (total)"));
    if (cents === null) continue;
    raw.push({ r, cents });
  }
  if (raw.length === 0) return { ok: false, error: "format" };

  // The account owner is the name that appears in nearly every payment.
  const seen = new Map<string, number>();
  for (const { r } of raw) for (const n of [cell(r, "From"), cell(r, "To")]) if (n) seen.set(n, (seen.get(n) ?? 0) + 1);
  const owner = [...seen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  const txs: VenmoTx[] = [];
  let excluded = 0;
  for (const { r, cents } of raw) {
    const status = cell(r, "Status");
    if (!COUNTED.has(status.toLowerCase())) { excluded++; continue; }
    const type = cell(r, "Type");
    const kind: VenmoKind = /transfer/i.test(type) ? "transfer" : cents >= 0 ? "received" : "sent";
    const from = cell(r, "From");
    const to = cell(r, "To");
    const other = kind === "transfer" ? cell(r, "Destination") || cell(r, "Funding Source") : [from, to].find((n) => n && n !== owner) ?? "";
    const at = cell(r, "Datetime"); // Venmo exports UTC
    const when = new Date(`${at}Z`);
    txs.push({
      id: cell(r, "ID"),
      date: Number.isNaN(when.getTime()) ? at.slice(0, 10) : todayIso(timeZone, when),
      type, status, note: cell(r, "Note"),
      counterparty: other ? (kind === "transfer" ? other : normalizeName(other)) : "",
      amount_cents: cents,
      fee_cents: Math.abs(parseVenmoAmount(cell(r, "Amount (fee)")) ?? 0),
      kind,
    });
  }
  txs.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const sum = (k: VenmoKind) => {
    const list = txs.filter((t) => t.kind === k);
    return { cents: list.reduce((s, t) => s + Math.abs(t.amount_cents), 0), count: list.length };
  };
  const group = (list: VenmoTx[], key: (t: VenmoTx) => string): Group[] => {
    const m = new Map<string, Group>();
    for (const t of list) {
      const k = key(t);
      const g = m.get(k.toLowerCase()) ?? { name: k, count: 0, cents: 0 };
      g.count++; g.cents += t.amount_cents;
      m.set(k.toLowerCase(), g);
    }
    return [...m.values()];
  };
  const received = txs.filter((t) => t.kind === "received");
  const movement = txs.reduce((s, t) => s + t.amount_cents, 0);

  return {
    ok: true,
    report: {
      account: accountMatch?.[1] ?? null,
      from: txs[0]?.date ?? null, to: txs[txs.length - 1]?.date ?? null,
      beginning_cents: beginning, ending_cents: ending,
      received: sum("received"), sent: sum("sent"), transfers: sum("transfer"),
      fees_cents: txs.reduce((s, t) => s + t.fee_cents, 0),
      difference_cents: beginning !== null && ending !== null ? beginning + movement - ending : null,
      byClient: group(received, (t) => t.counterparty || "—").sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name)),
      byWeek: group(received, (t) => startOfWeek(t.date)).sort((a, b) => a.name.localeCompare(b.name)),
      transactions: txs,
      excluded,
    },
  };
}
