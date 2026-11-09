import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney, quoteNumber } from "@/lib/money";
import type { InvoiceDetail } from "./queries";

const L = {
  en: {
    invoice: "INVOICE", billTo: "Bill to", issued: "Issue date", due: "Due date", description: "Description", qty: "Qty", unit: "Unit price", amount: "Amount",
    subtotal: "Subtotal", discount: "Discount", tax: "Tax", total: "Total", paid: "Paid", balance: "Balance due", payments: "Payments received",
    notes: "Notes", terms: "Terms and conditions", PAID: "PAID", VOID: "VOID", OVERDUE: "OVERDUE",
    methods: { cash: "Cash", check: "Check", card: "Card", zelle: "Zelle", venmo: "Venmo", bank_transfer: "Bank transfer", other: "Other" },
  },
  es: {
    invoice: "FACTURA", billTo: "Facturar a", issued: "Fecha de emisión", due: "Fecha de vencimiento", description: "Descripción", qty: "Cant.", unit: "Precio unitario", amount: "Importe",
    subtotal: "Subtotal", discount: "Descuento", tax: "Impuesto", total: "Total", paid: "Pagado", balance: "Saldo pendiente", payments: "Pagos recibidos",
    notes: "Notas", terms: "Términos y condiciones", PAID: "PAGADA", VOID: "ANULADA", OVERDUE: "VENCIDA",
    methods: { cash: "Efectivo", check: "Cheque", card: "Tarjeta", zelle: "Zelle", venmo: "Venmo", bank_transfer: "Transferencia", other: "Otro" },
  },
} as const;

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#047857" },
  biz: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b7280" },
  label: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 2 },
  block: { marginTop: 18 },
  th: { flexDirection: "row", backgroundColor: "#ecfdf5", padding: 5, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", padding: 5, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  c1: { flex: 4 }, c2: { flex: 1, textAlign: "right" }, c3: { flex: 1.5, textAlign: "right" }, c4: { flex: 1.5, textAlign: "right" },
  totals: { marginTop: 8, alignSelf: "flex-end", width: 220 },
  tl: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  stamp: { fontSize: 12, fontFamily: "Helvetica-Bold" },
});

export type PdfBusiness = { name: string; phone: string | null; email: string | null; address: string | null; tax_id: string | null };

export function InvoicePdf({
  invoice, business, prefix, currency, dateFormat, locale,
}: { invoice: InvoiceDetail; business: PdfBusiness; prefix: string; currency: string; dateFormat: string; locale: "en" | "es" }) {
  const t = L[locale];
  const m = (c: number) => formatMoney(c, currency);
  const d = (v: string) => formatDateOnly(v, dateFormat);
  const x = invoice.totals;
  const st = invoice.display_status;
  const stamp = st === "paid" ? t.PAID : st === "void" ? t.VOID : st === "overdue" ? t.OVERDUE : null;
  const stampColor = st === "paid" ? "#047857" : "#b91c1c";

  return (
    <Document title={`${quoteNumber(prefix, invoice.number)} - ${business.name}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.row}>
          <View>
            <Text style={s.biz}>{business.name}</Text>
            {business.address && <Text style={s.muted}>{business.address}</Text>}
            {business.phone && <Text style={s.muted}>{business.phone}</Text>}
            {business.email && <Text style={s.muted}>{business.email}</Text>}
            {business.tax_id && <Text style={s.muted}>{business.tax_id}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>{t.invoice}</Text>
            <Text style={s.bold}>{quoteNumber(prefix, invoice.number)}</Text>
            {stamp && <Text style={[s.stamp, { color: stampColor }]}>{stamp}</Text>}
          </View>
        </View>

        <View style={[s.row, s.block]}>
          <View>
            <Text style={s.label}>{t.billTo}</Text>
            <Text style={s.bold}>{invoice.customer_name}</Text>
            {invoice.billing_address && <Text style={s.muted}>{invoice.billing_address}</Text>}
            {invoice.customer_email && <Text style={s.muted}>{invoice.customer_email}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text><Text style={s.muted}>{t.issued}: </Text>{d(invoice.issue_date)}</Text>
            <Text><Text style={s.muted}>{t.due}: </Text>{d(invoice.due_date)}</Text>
          </View>
        </View>

        <View style={s.block}>
          <View style={s.th}><Text style={s.c1}>{t.description}</Text><Text style={s.c2}>{t.qty}</Text><Text style={s.c3}>{t.unit}</Text><Text style={s.c4}>{t.amount}</Text></View>
          {invoice.lines.map((l) => (
            <View key={l.id} style={s.tr} wrap={false}>
              <Text style={s.c1}>{l.description}</Text><Text style={s.c2}>{l.quantity}</Text>
              <Text style={s.c3}>{m(l.unit_price_cents)}</Text><Text style={s.c4}>{m(Math.round(l.quantity * l.unit_price_cents))}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals}>
          <View style={s.tl}><Text>{t.subtotal}</Text><Text>{m(x.subtotal_cents)}</Text></View>
          {x.discount_cents > 0 && <View style={s.tl}><Text>{t.discount}</Text><Text>-{m(x.discount_cents)}</Text></View>}
          {invoice.tax_rate > 0 && <View style={s.tl}><Text>{t.tax} ({invoice.tax_rate}%)</Text><Text>{m(x.tax_cents)}</Text></View>}
          <View style={[s.tl, s.bold, { borderTopWidth: 1, marginTop: 3, paddingTop: 4 }]}><Text>{t.total}</Text><Text>{m(x.total_cents)}</Text></View>
          {x.paid_cents > 0 && <View style={s.tl}><Text>{t.paid}</Text><Text>-{m(x.paid_cents)}</Text></View>}
          {x.paid_cents > 0 && <View style={[s.tl, s.bold]}><Text>{t.balance}</Text><Text>{m(x.balance_cents)}</Text></View>}
        </View>

        {invoice.payments.length > 0 && (
          <View style={s.block}>
            <Text style={s.label}>{t.payments}</Text>
            {invoice.payments.map((p) => (
              <View key={p.id} style={s.tl}>
                <Text>{d(p.paid_on)} · {t.methods[p.method as keyof typeof t.methods] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</Text>
                <Text>{m(p.amount_cents)}</Text>
              </View>
            ))}
          </View>
        )}

        {invoice.notes && <View style={s.block}><Text style={s.label}>{t.notes}</Text><Text>{invoice.notes}</Text></View>}
        {invoice.terms && <View style={s.block}><Text style={s.label}>{t.terms}</Text><Text style={[s.muted, { fontSize: 8 }]}>{invoice.terms}</Text></View>}
      </Page>
    </Document>
  );
}
