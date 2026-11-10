import { Document, Image as PdfImage, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateOnly } from "@/lib/dates";
import { displayUrl } from "@/lib/business";
import { formatMoney, quoteNumber } from "@/lib/money";
import type { InvoiceDetail } from "./queries";

const L = {
  en: {
    invoice: "INVOICE", number: "Invoice #", date: "Date", due: "Due Date", billTo: "BILL TO", description: "Description", qty: "Qty", rate: "Rate", amount: "Amount",
    subtotal: "Subtotal", discount: "Discount", tax: "Tax", total: "Total", paid: "Total Paid", balance: "BALANCE DUE", payments: "Payment History",
    notes: "Notes", terms: "TERMS & CONDITIONS", thanks: "Thank you for your business!", PAID: "PAID", VOID: "VOID", OVERDUE: "OVERDUE", PARTIAL: "PARTIAL",
    methods: { cash: "cash", check: "check", card: "card", zelle: "Zelle", venmo: "Venmo", bank_transfer: "bank transfer", other: "other" },
  },
  es: {
    invoice: "FACTURA", number: "Factura #", date: "Fecha", due: "Vencimiento", billTo: "FACTURAR A", description: "Descripción", qty: "Cant.", rate: "Precio", amount: "Importe",
    subtotal: "Subtotal", discount: "Descuento", tax: "Impuesto", total: "Total", paid: "Total pagado", balance: "SALDO PENDIENTE", payments: "Historial de pagos",
    notes: "Notas", terms: "TÉRMINOS Y CONDICIONES", thanks: "¡Gracias por su preferencia!", PAID: "PAGADA", VOID: "ANULADA", OVERDUE: "VENCIDA", PARTIAL: "PARCIAL",
    methods: { cash: "efectivo", check: "cheque", card: "tarjeta", zelle: "Zelle", venmo: "Venmo", bank_transfer: "transferencia", other: "otro" },
  },
} as const;

const TEAL = "#0b7a75"; // same teal as the app
const GREEN = "#15803d";
const RED = "#c62828";
const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#d1d5db";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 50, paddingHorizontal: 44, fontSize: 10, fontFamily: "Helvetica", color: INK },
  row: { flexDirection: "row", justifyContent: "space-between" },
  logo: { maxHeight: 60, maxWidth: 120, objectFit: "contain", objectPositionX: 0 },
  logoBox: { width: 48, height: 48, borderRadius: 8, backgroundColor: TEAL, alignItems: "center", justifyContent: "center" },
  logoLetter: { color: "#ffffff", fontSize: 24, fontFamily: "Helvetica-Bold" },
  biz: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: MUTED, marginBottom: 2, textAlign: "right" },
  pill: { alignSelf: "flex-end", borderRadius: 10, paddingVertical: 3, paddingHorizontal: 12, color: "#ffffff", fontSize: 9, fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 24, fontFamily: "Helvetica-Bold", color: TEAL, marginTop: 8, marginBottom: 6, textAlign: "right" },
  meta: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3 },
  metaLabel: { color: MUTED, width: 52, textAlign: "right", paddingRight: 8 },
  metaValue: { width: 70, textAlign: "right", fontFamily: "Helvetica-Bold" },
  divider: { borderBottomWidth: 1, borderBottomColor: LINE, marginTop: 18, marginBottom: 14 },
  billLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  customer: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "right", marginBottom: 3 },
  right: { textAlign: "right", color: MUTED, marginBottom: 2 },
  th: { flexDirection: "row", backgroundColor: TEAL, color: "#ffffff", paddingVertical: 6, paddingHorizontal: 8, fontFamily: "Helvetica-Bold", marginTop: 14 },
  tr: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: LINE },
  c1: { flex: 5 }, c2: { flex: 1, textAlign: "right" }, c3: { flex: 1.6, textAlign: "right" }, c4: { flex: 1.6, textAlign: "right" },
  totals: { marginTop: 14, alignSelf: "flex-end", width: 230 },
  tl: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: LINE },
  bold: { fontFamily: "Helvetica-Bold" },
  balance: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, paddingHorizontal: 8, marginTop: 4, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 11 },
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 22, marginBottom: 6 },
  payBox: { backgroundColor: "#f3f4f6", borderRadius: 4, padding: 8 },
  pay: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: TEAL, borderRadius: 4, backgroundColor: "#ffffff", paddingVertical: 6, paddingHorizontal: 10, marginBottom: 4 },
  stamp: { position: "absolute", top: 176, left: 225, borderWidth: 3, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 12, transform: "rotate(-14deg)", alignItems: "center" },
  stampText: { fontSize: 26, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  stampDate: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  termsTitle: { textAlign: "center", fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 26 },
  terms: { textAlign: "center", color: MUTED, fontSize: 8, lineHeight: 1.5, marginTop: 4 },
  thanks: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 14 },
});

export type PdfBusiness = { name: string; phone: string | null; email: string | null; address: string | null; tax_id: string | null; website?: string | null };
export type PdfLogo = { data: Buffer; format: "png" | "jpg" } | null;

export function InvoicePdf({
  invoice, business, logo, prefix, currency, dateFormat, locale,
}: { invoice: InvoiceDetail; business: PdfBusiness; logo?: PdfLogo; prefix: string; currency: string; dateFormat: string; locale: "en" | "es" }) {
  const t = L[locale];
  const m = (c: number) => formatMoney(c, currency);
  const d = (v: string) => formatDateOnly(v, dateFormat);
  const x = invoice.totals;
  const st = invoice.display_status;
  const label = st === "paid" ? t.PAID : st === "void" ? t.VOID : st === "overdue" ? t.OVERDUE : st === "partial" ? t.PARTIAL : null;
  const color = st === "paid" || st === "partial" ? GREEN : RED;
  const lastPaid = invoice.payments.reduce<string | null>((a, p) => (a && a > p.paid_on ? a : p.paid_on), null);
  const showStamp = st === "paid" || st === "void";
  const balanceColor = x.balance_cents <= 0 ? GREEN : st === "overdue" ? RED : TEAL;

  return (
    <Document title={`${quoteNumber(prefix, invoice.number)} - ${business.name}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.row}>
          <View style={{ width: "30%" }}>
            {logo ? <PdfImage src={{ data: logo.data, format: logo.format }} style={s.logo} /> : <View style={s.logoBox}><Text style={s.logoLetter}>{business.name.trim().charAt(0).toUpperCase() || "B"}</Text></View>}
          </View>
          <View style={{ width: "36%", alignItems: "flex-end" }}>
            <Text style={[s.biz, { textAlign: "right" }]}>{business.name}</Text>
            {business.address && <Text style={s.muted}>{business.address}</Text>}
            {business.phone && <Text style={s.muted}>{business.phone}</Text>}
            {business.email && <Text style={s.muted}>{business.email}</Text>}
            {business.website && <Text style={s.muted}>{displayUrl(business.website)}</Text>}
            {business.tax_id && <Text style={s.muted}>{business.tax_id}</Text>}
          </View>
          <View style={{ width: "34%" }}>
            {label && <Text style={[s.pill, { backgroundColor: color }]}>{label}</Text>}
            <Text style={s.h1}>{t.invoice}</Text>
            <View style={s.meta}><Text style={s.metaLabel}>{t.number}</Text><Text style={s.metaValue}>{quoteNumber(prefix, invoice.number)}</Text></View>
            <View style={s.meta}><Text style={s.metaLabel}>{t.date}</Text><Text style={s.metaValue}>{d(invoice.issue_date)}</Text></View>
            <View style={s.meta}><Text style={s.metaLabel}>{t.due}</Text><Text style={s.metaValue}>{d(invoice.due_date)}</Text></View>
          </View>
        </View>

        <View style={s.divider} />

        <View style={[s.row, { minHeight: 86 }]}>
          <Text style={s.billLabel}>{t.billTo}</Text>
          <View style={{ maxWidth: 300 }}>
            <Text style={s.customer}>{invoice.customer_name}</Text>
            {invoice.billing_address && <Text style={s.right}>{invoice.billing_address}</Text>}
            {invoice.customer_email && <Text style={s.right}>{invoice.customer_email}</Text>}
          </View>
        </View>

        {showStamp && (
          <View style={[s.stamp, { borderColor: color }]}>
            <Text style={[s.stampText, { color }]}>{label}</Text>
            {st === "paid" && lastPaid && <Text style={[s.stampDate, { color }]}>{d(lastPaid)}</Text>}
          </View>
        )}

        <View style={s.th}>
          <Text style={s.c1}>{t.description}</Text><Text style={s.c2}>{t.qty}</Text><Text style={s.c3}>{t.rate}</Text><Text style={s.c4}>{t.amount}</Text>
        </View>
        {invoice.lines.map((l) => (
          <View key={l.id} style={s.tr} wrap={false}>
            <Text style={s.c1}>{l.description}</Text><Text style={s.c2}>{l.quantity}</Text>
            <Text style={s.c3}>{m(l.unit_price_cents)}</Text><Text style={[s.c4, s.bold]}>{m(Math.round(l.quantity * l.unit_price_cents))}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <View style={s.tl}><Text style={{ color: MUTED }}>{t.subtotal}</Text><Text>{m(x.subtotal_cents)}</Text></View>
          {x.discount_cents > 0 && <View style={s.tl}><Text style={{ color: MUTED }}>{t.discount}</Text><Text>-{m(x.discount_cents)}</Text></View>}
          {invoice.tax_rate > 0 && <View style={s.tl}><Text style={{ color: MUTED }}>{t.tax} ({invoice.tax_rate}%)</Text><Text>{m(x.tax_cents)}</Text></View>}
          <View style={s.tl}><Text style={s.bold}>{t.total}</Text><Text style={s.bold}>{m(x.total_cents)}</Text></View>
          <View style={s.tl}><Text style={{ color: MUTED }}>{t.paid}</Text><Text style={{ color: GREEN }}>{m(x.paid_cents)}</Text></View>
          <View style={[s.balance, { backgroundColor: balanceColor }]}><Text>{t.balance}</Text><Text>{m(x.balance_cents)}</Text></View>
        </View>

        {invoice.payments.length > 0 && (
          <View wrap={false}>
            <Text style={s.sectionTitle}>{t.payments}</Text>
            <View style={s.payBox}>
              {invoice.payments.map((p) => (
                <View key={p.id} style={s.pay}>
                  <View>
                    <Text style={s.bold}>{m(p.amount_cents)} - {t.methods[p.method as keyof typeof t.methods] ?? p.method}</Text>
                    <Text style={{ color: MUTED, fontSize: 9 }}>{d(p.paid_on)}{p.reference ? ` · ${p.reference}` : ""}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {invoice.notes && <View wrap={false}><Text style={s.sectionTitle}>{t.notes}</Text><Text style={{ color: MUTED }}>{invoice.notes}</Text></View>}
        {invoice.terms && <View wrap={false}><Text style={s.termsTitle}>{t.terms}</Text><Text style={s.terms}>{invoice.terms}</Text></View>}
        <Text style={s.thanks}>{t.thanks}</Text>
      </Page>
    </Document>
  );
}
