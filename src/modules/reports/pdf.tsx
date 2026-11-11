import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatCell, isRight } from "./format";
import type { Col, ReportResult, Row, Tone } from "./run";

export type ReportPdfLabels = { period: string; generated: string; page: string; of: string; transactions: (n: number) => string };

const TEAL = "#0b7a75";
const GREEN = "#15803d";
const AMBER = "#d97706";
const RED = "#c62828";
const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#9ca3af";
const BORDERS = [TEAL, GREEN, AMBER];
const TONE: Record<Tone, string> = { default: INK, green: GREEN, accent: TEAL, danger: RED };

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 50, paddingHorizontal: 40, fontSize: 9, fontFamily: "Helvetica", color: INK },
  company: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "center" },
  title: { fontSize: 14, textAlign: "center", marginTop: 6 },
  period: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 6, textTransform: "uppercase" },
  generated: { fontSize: 9, color: MUTED, textAlign: "center", marginTop: 5 },
  rule: { borderBottomWidth: 1, borderBottomColor: LINE, marginTop: 14, marginBottom: 16 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderWidth: 1.5, padding: 9 },
  statLabel: { fontSize: 8, color: MUTED },
  statValue: { fontSize: 15, fontFamily: "Helvetica-Bold", marginVertical: 5 },
  statHint: { fontSize: 7.5, color: MUTED },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6 },
  th: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: LINE, paddingVertical: 5, paddingHorizontal: 4 },
  thText: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#d1d5db" },
  total: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: LINE, fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: MUTED },
});

const flex = (c: Col, first: boolean) => (c.kind === "money" ? 1.3 : c.kind === "date" ? 1.2 : c.kind === "int" || c.kind === "pct" ? 0.9 : first ? 2.4 : 1.6);

function Table({ cols, rows, totals, currency, dateFormat }: { cols: Col[]; rows: Row[]; totals?: Row; currency: string; dateFormat: string }) {
  const cellText = (c: Col, r: Row) => formatCell(c, r[c.key] ?? null, currency, dateFormat);
  const style = (c: Col, i: number) => ({ flex: flex(c, i === 0), textAlign: isRight(c) ? ("right" as const) : ("left" as const), paddingRight: 4 });
  return (
    <View>
      <View style={s.th} wrap={false}>{cols.map((c, i) => <Text key={c.key} style={[s.thText, style(c, i)]}>{c.label}</Text>)}</View>
      {rows.map((r, i) => (
        <View key={i} style={[s.tr, r._bold ? { fontFamily: "Helvetica-Bold", backgroundColor: "#f3f4f6" } : {}, i % 2 === 1 && !r._bold ? { backgroundColor: "#f9fafb" } : {}]} wrap={false}>
          {cols.map((c, ci) => <Text key={c.key} style={[style(c, ci), c.positive ? { color: GREEN } : {}]}>{cellText(c, r)}</Text>)}
        </View>
      ))}
      {totals && <View style={s.total} wrap={false}>{cols.map((c, i) => <Text key={c.key} style={style(c, i)}>{cellText(c, totals)}</Text>)}</View>}
    </View>
  );
}

/** A report as a printable PDF: company, title and period, three headline figures, a summary table and the detail. */
export function ReportPdf({
  company, title, periodLabel, generatedOn, result, currency, dateFormat, labels,
}: { company: string; title: string; periodLabel: string; generatedOn: string; result: ReportResult; currency: string; dateFormat: string; labels: ReportPdfLabels }) {
  return (
    <Document title={`${title} - ${company}`}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.company}>{company}</Text>
        <Text style={s.title}>{title}</Text>
        <Text style={s.period}>{labels.period}: {periodLabel}</Text>
        <Text style={s.generated}>{labels.generated} {generatedOn}</Text>
        <View style={s.rule} />

        <View style={s.stats} wrap={false}>
          {result.stats.map((x, i) => (
            <View key={x.label} style={[s.stat, { borderColor: BORDERS[i % 3] }]}>
              <Text style={s.statLabel}>{x.label}</Text>
              <Text style={[s.statValue, { color: TONE[x.tone] }]}>{x.kind === "money" ? formatCell({ key: "", label: "", kind: "money" }, x.value, currency, dateFormat) : x.value.toLocaleString("en-US")}</Text>
              <Text style={s.statHint}>{x.hint}</Text>
            </View>
          ))}
        </View>

        {result.breakdown && result.breakdown.rows.length > 0 && (
          <View>
            <Text style={s.h2}>{result.breakdown.title}</Text>
            <Table cols={result.breakdown.cols} rows={result.breakdown.rows} currency={currency} dateFormat={dateFormat} />
          </View>
        )}

        {result.groups ? result.groups.map((g) => (
          <View key={g.label}>
            <Text style={s.h2}>{g.label} ({labels.transactions(g.count)})</Text>
            <Table cols={result.cols} rows={g.rows} currency={currency} dateFormat={dateFormat} />
          </View>
        )) : (
          <View>
            <Text style={s.h2}>{result.tableTitle}</Text>
            <Table cols={result.cols} rows={result.rows} totals={result.totals} currency={currency} dateFormat={dateFormat} />
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>{company}</Text>
          <Text render={({ pageNumber, totalPages }) => `${labels.page} ${pageNumber} ${labels.of} ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
