import type { Cell, Col, ReportResult, Row } from "./run";

/** CSV (UTF-8 with BOM so Excel opens accents correctly). Money as plain decimals, dates as ISO. */
export function toCsv(r: ReportResult): string {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Cells that start with a formula character are neutralised so a spreadsheet won't run them.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const cell = (col: Col, row: Row): Cell => {
    const v = row[col.key] ?? null;
    return col.kind === "money" && typeof v === "number" ? (v / 100).toFixed(2) : v;
  };
  const lines = [r.cols.map((c) => esc(c.label)).join(",")];
  for (const row of [...r.rows, ...(r.totals ? [r.totals] : [])]) lines.push(r.cols.map((c) => esc(cell(c, row))).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

