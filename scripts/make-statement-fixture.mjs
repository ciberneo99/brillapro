// Builds e2e/fixtures/statement.pdf: a small made-up bank statement (no real data) used by the end-to-end test.
import fs from "node:fs";
import { createElement as h } from "react";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";

const lines = [
  "Sample Business Checking",
  "Statement period January 1, 2026 through January 31, 2026",
  "Beginning balance $1,000.00",
  "TRANSACTION DETAIL",
  "01/02 Zelle payment from Rita Lopez 150.00 1,150.00",
  "01/03 SHELL OIL 57444 45.20 1,104.80",
  "01/05 Monthly service fee 12.00 1,092.80",
  "01/09 Owner draw transfer 300.00 792.80",
  "Total deposits and additions $150.00",
];
const buf = await renderToBuffer(h(Document, null, h(Page, { size: "LETTER", style: { padding: 40, fontSize: 10 } }, h(View, null, lines.map((l, i) => h(Text, { key: i, style: { marginBottom: 6 } }, l))))));
fs.mkdirSync("e2e/fixtures", { recursive: true });
fs.writeFileSync("e2e/fixtures/statement.pdf", buf);
console.log("ok", buf.length);
