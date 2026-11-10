import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { PdfBusiness } from "@/modules/invoices/pdf";
import type { VenmoReport } from "./parse";

const L = {
  en: {
    title: "VENMO REPORT", account: "Account", period: "Period", summary: "Summary", received: "Received", transfers: "Transferred to bank", sent: "Sent", fees: "Fees",
    beginning: "Beginning balance", ending: "Ending balance", payments: "payments", checkOk: "The statement adds up: beginning balance plus movements equals the ending balance.",
    checkBad: "The statement does not add up. Difference:", byClient: "Received by customer", byWeek: "Received by week (starting Sunday)", transactions: "Transactions",
    customer: "Customer", count: "Payments", total: "Total", week: "Week of", date: "Date", kind: "Type", who: "Name", note: "Note", amount: "Amount",
    kinds: { received: "Received", sent: "Sent", transfer: "To bank" }, excluded: "Not counted (pending, failed or cancelled):", page: "Page", of: "of", generated: "Generated from the Venmo statement CSV.",
  },
  es: {
    title: "REPORTE DE VENMO", account: "Cuenta", period: "Periodo", summary: "Resumen", received: "Recibido", transfers: "Transferido al banco", sent: "Enviado", fees: "Comisiones",
    beginning: "Saldo inicial", ending: "Saldo final", payments: "pagos", checkOk: "El estado de cuenta cuadra: saldo inicial más movimientos es igual al saldo final.",
    checkBad: "El estado de cuenta no cuadra. Diferencia:", byClient: "Recibido por cliente", byWeek: "Recibido por semana (inicia en domingo)", transactions: "Movimientos",
    customer: "Cliente", count: "Pagos", total: "Total", week: "Semana del", date: "Fecha", kind: "Tipo", who: "Nombre", note: "Nota", amount: "Monto",
    kinds: { received: "Recibido", sent: "Enviado", transfer: "Al banco" }, excluded: "No contados (pendientes, fallidos o cancelados):", page: "Página", of: "de", generated: "Generado desde el CSV del estado de cuenta de Venmo.",
  },
} as const;

const TEAL = "#1596ad";
const GREEN = "#15803d";
const RED = "#c62828";
const MUTED = "#6b7280";
const LINE = "#d1d5db";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 54, paddingHorizontal: 44, fontSize: 9.5, fontFamily: "Helvetica", color: "#1f2937" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  biz: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", color: TEAL, textAlign: "right" },
  muted: { color: MUTED },
  divider: { borderBottomWidth: 1, borderBottomColor: LINE, marginTop: 14, marginBottom: 12 },
  h2: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6 },
  cards: { flexDirection: "row", gap: 8 },
  card: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8 },
  cardLabel: { color: MUTED, fontSize: 8, marginBottom: 3 },
  cardValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  th: { flexDirection: "row", backgroundColor: TEAL, color: "#ffffff", paddingVertical: 5, paddingHorizontal: 6, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: LINE },
  right: { textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: MUTED },
});

/** The built-in PDF font has no emoji or non-Latin letters: keep Latin text (with accents) and drop the rest. */
const clean = (v: string) => v.replace(/[^ -ɏ–—‘-”]/g, "").replace(/\s+/g, " ").trim();

export function VenmoPdf({
  report, business, currency, dateFormat, locale,
}: { report: VenmoReport; business: Pick<PdfBusiness, "name">; currency: string; dateFormat: string; locale: "en" | "es" }) {
  const t = L[locale];
  const m = (c: number) => formatMoney(c, currency);
  const d = (v: string | null) => (v ? formatDateOnly(v, dateFormat) : "");
  const r = report;
  const diff = r.difference_cents;

  return (
    <Document title={`${t.title} ${d(r.from)} - ${d(r.to)}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.row}>
          <View>
            <Text style={s.biz}>{clean(business.name)}</Text>
            {r.account && <Text style={s.muted}>{t.account}: {clean(r.account)}</Text>}
            <Text style={s.muted}>{t.period}: {d(r.from)} - {d(r.to)}</Text>
          </View>
          <Text style={s.h1}>{t.title}</Text>
        </View>
        <View style={s.divider} />

        <Text style={[s.h2, { marginTop: 0 }]}>{t.summary}</Text>
        <View style={s.cards}>
          <View style={s.card}><Text style={s.cardLabel}>{t.received} ({r.received.count} {t.payments})</Text><Text style={[s.cardValue, { color: GREEN }]}>{m(r.received.cents)}</Text></View>
          <View style={s.card}><Text style={s.cardLabel}>{t.transfers} ({r.transfers.count})</Text><Text style={s.cardValue}>{m(r.transfers.cents)}</Text></View>
          {r.sent.count > 0 && <View style={s.card}><Text style={s.cardLabel}>{t.sent} ({r.sent.count})</Text><Text style={s.cardValue}>{m(r.sent.cents)}</Text></View>}
          {r.fees_cents > 0 && <View style={s.card}><Text style={s.cardLabel}>{t.fees}</Text><Text style={s.cardValue}>{m(r.fees_cents)}</Text></View>}
        </View>
        {(r.beginning_cents !== null || r.ending_cents !== null) && (
          <View style={[s.cards, { marginTop: 8 }]}>
            {r.beginning_cents !== null && <View style={s.card}><Text style={s.cardLabel}>{t.beginning}</Text><Text style={s.cardValue}>{m(r.beginning_cents)}</Text></View>}
            {r.ending_cents !== null && <View style={s.card}><Text style={s.cardLabel}>{t.ending}</Text><Text style={s.cardValue}>{m(r.ending_cents)}</Text></View>}
          </View>
        )}
        {diff !== null && (
          <Text style={{ marginTop: 8, fontSize: 8.5, color: diff === 0 ? GREEN : RED }}>
            {diff === 0 ? t.checkOk : `${t.checkBad} ${m(Math.abs(diff))}`}
          </Text>
        )}
        {r.excluded > 0 && <Text style={{ marginTop: 4, fontSize: 8.5, color: MUTED }}>{t.excluded} {r.excluded}</Text>}

        {r.byClient.length > 0 && (
          <View wrap={false}>
            <Text style={s.h2}>{t.byClient}</Text>
            <View style={s.th}><Text style={{ flex: 5 }}>{t.customer}</Text><Text style={[{ flex: 1.2 }, s.right]}>{t.count}</Text><Text style={[{ flex: 2 }, s.right]}>{t.total}</Text></View>
            {r.byClient.map((g) => (
              <View key={g.name} style={s.tr}><Text style={{ flex: 5 }}>{clean(g.name)}</Text><Text style={[{ flex: 1.2 }, s.right]}>{g.count}</Text><Text style={[{ flex: 2 }, s.right, s.bold]}>{m(g.cents)}</Text></View>
            ))}
            <View style={[s.tr, { borderBottomWidth: 0 }]}><Text style={[{ flex: 5 }, s.bold]}>{t.total}</Text><Text style={[{ flex: 1.2 }, s.right, s.bold]}>{r.received.count}</Text><Text style={[{ flex: 2 }, s.right, s.bold]}>{m(r.received.cents)}</Text></View>
          </View>
        )}

        {r.byWeek.length > 0 && (
          <View wrap={false}>
            <Text style={s.h2}>{t.byWeek}</Text>
            <View style={s.th}><Text style={{ flex: 5 }}>{t.week}</Text><Text style={[{ flex: 1.2 }, s.right]}>{t.count}</Text><Text style={[{ flex: 2 }, s.right]}>{t.total}</Text></View>
            {r.byWeek.map((g) => (
              <View key={g.name} style={s.tr}><Text style={{ flex: 5 }}>{d(g.name)}</Text><Text style={[{ flex: 1.2 }, s.right]}>{g.count}</Text><Text style={[{ flex: 2 }, s.right, s.bold]}>{m(g.cents)}</Text></View>
            ))}
          </View>
        )}

        <Text style={s.h2} break>{t.transactions}</Text>
        <View style={s.th}>
          <Text style={{ flex: 1.6 }}>{t.date}</Text><Text style={{ flex: 1.4 }}>{t.kind}</Text><Text style={{ flex: 3 }}>{t.who}</Text><Text style={{ flex: 4 }}>{t.note}</Text><Text style={[{ flex: 2 }, s.right]}>{t.amount}</Text>
        </View>
        {r.transactions.map((x) => (
          <View key={x.id} style={s.tr} wrap={false}>
            <Text style={{ flex: 1.6 }}>{d(x.date)}</Text>
            <Text style={{ flex: 1.4 }}>{t.kinds[x.kind]}</Text>
            <Text style={{ flex: 3 }}>{clean(x.counterparty)}</Text>
            <Text style={{ flex: 4, color: MUTED }}>{clean(x.note)}</Text>
            <Text style={[{ flex: 2 }, s.right, s.bold, { color: x.amount_cents < 0 ? RED : GREEN }]}>{x.amount_cents < 0 ? "-" : ""}{m(Math.abs(x.amount_cents))}</Text>
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text>{t.generated}</Text>
          <Text render={({ pageNumber, totalPages }) => `${t.page} ${pageNumber} ${t.of} ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
