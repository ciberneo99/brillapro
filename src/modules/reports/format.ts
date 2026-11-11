import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Cell, Col, Group, ReportResult, Row } from "./run";

/** A cell as text for the screen and the PDF (CSV has its own plain format). */
export function formatCell(col: Col, v: Cell, currency: string, dateFormat: string): string {
  if (v === null || v === undefined || v === "") return "";
  if (col.kind === "money") return formatMoney(Number(v), currency);
  if (col.kind === "date") return formatDateOnly(String(v), dateFormat);
  if (col.kind === "pct") return `${v}%`;
  return String(v);
}

export const isRight = (c: Col) => c.kind === "money" || c.kind === "int" || c.kind === "pct";

/** Sorts by the report's date column (when it has one), inside each group too. "none" keeps the report's own order. */
export function sortByDate(r: ReportResult, dir: "asc" | "desc" | "none"): ReportResult {
  const dateCol = r.cols.find((c) => c.kind === "date");
  if (dir === "none" || !dateCol) return r;
  const k = dateCol.key;
  const sign = dir === "asc" ? 1 : -1;
  const sort = (rows: Row[]) => [...rows].sort((a, b) => sign * String(a[k] ?? "").localeCompare(String(b[k] ?? "")));
  return { ...r, rows: sort(r.rows), groups: r.groups?.map((g): Group => ({ ...g, rows: sort(g.rows) })) };
}
