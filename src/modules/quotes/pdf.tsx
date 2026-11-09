import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney, quoteNumber } from "@/lib/money";
import type { QuoteDetail } from "./queries";

const L = {
  en: {
    quote: "QUOTE", preparedFor: "Prepared for", date: "Date", valid: "Valid until", service: "Service", option: "Option",
    description: "Description", qty: "Qty", unit: "Unit price", amount: "Amount", subtotal: "Subtotal", discount: "Discount",
    tax: "Tax", total: "Total", notes: "Notes", terms: "Terms and conditions", extras: "Additional items", includes: "Includes",
    accepted: "ACCEPTED", declined: "DECLINED", expired: "EXPIRED",
  },
  es: {
    quote: "COTIZACIÓN", preparedFor: "Preparada para", date: "Fecha", valid: "Válida hasta", service: "Servicio", option: "Opción",
    description: "Descripción", qty: "Cant.", unit: "Precio unitario", amount: "Importe", subtotal: "Subtotal", discount: "Descuento",
    tax: "Impuesto", total: "Total", notes: "Notas", terms: "Términos y condiciones", extras: "Conceptos adicionales", includes: "Incluye",
    accepted: "ACEPTADA", declined: "RECHAZADA", expired: "VENCIDA",
  },
} as const;

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#1d4ed8" },
  biz: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b7280" },
  label: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 2 },
  block: { marginTop: 18 },
  th: { flexDirection: "row", backgroundColor: "#eff6ff", padding: 5, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", padding: 5, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  c1: { flex: 4 }, c2: { flex: 1, textAlign: "right" }, c3: { flex: 1.5, textAlign: "right" }, c4: { flex: 1.5, textAlign: "right" },
  totals: { marginTop: 8, alignSelf: "flex-end", width: 200 },
  tl: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  tier: { marginTop: 10, borderWidth: 0.5, borderColor: "#d1d5db", borderRadius: 4, padding: 8 },
  stamp: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#047857" },
});

export type PdfBusiness = { name: string; phone: string | null; email: string | null; address: string | null; tax_id: string | null };

export function QuotePdf({
  quote, business, prefix, currency, dateFormat, locale,
}: { quote: QuoteDetail; business: PdfBusiness; prefix: string; currency: string; dateFormat: string; locale: "en" | "es" }) {
  const t = L[locale];
  const m = (c: number) => formatMoney(c, currency);
  const d = (v: string) => formatDateOnly(v, dateFormat);
  const c = quote.customer;
  const customerName = `${c.first_name} ${c.last_name}`.trim() || c.company_name;
  const address = [c.service_address, [c.city, c.state].filter(Boolean).join(", "), c.zip_code].filter(Boolean).join(" ");
  const money = (cents: number, line: number) => Math.round(line * cents);
  const extras = quote.lines.reduce((sum, l) => sum + money(l.unit_price_cents, l.quantity), 0);
  const stamp = quote.display_status === "accepted" ? t.accepted : quote.display_status === "declined" ? t.declined : quote.display_status === "expired" ? t.expired : null;
  const totalFor = (optionId: string | null) => quote.totals.find((x) => x.option_id === optionId);
  // After acceptance only the chosen option is shown; otherwise every option is offered side by side.
  const shown = quote.selected_option_id ? quote.options.filter((o) => o.id === quote.selected_option_id) : quote.options;

  const totalsBox = (optionId: string | null) => {
    const x = totalFor(optionId);
    if (!x) return null;
    return (
      <View style={s.totals}>
        <View style={s.tl}><Text>{t.subtotal}</Text><Text>{m(x.subtotal_cents)}</Text></View>
        {x.discount_cents > 0 && <View style={s.tl}><Text>{t.discount}</Text><Text>-{m(x.discount_cents)}</Text></View>}
        {quote.tax_rate > 0 && <View style={s.tl}><Text>{t.tax} ({quote.tax_rate}%)</Text><Text>{m(x.tax_cents)}</Text></View>}
        <View style={[s.tl, s.bold, { borderTopWidth: 1, marginTop: 3, paddingTop: 4 }]}><Text>{t.total}</Text><Text>{m(x.total_cents)}</Text></View>
      </View>
    );
  };

  return (
    <Document title={`${quoteNumber(prefix, quote.number)} - ${business.name}`}>
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
            <Text style={s.h1}>{t.quote}</Text>
            <Text style={s.bold}>{quoteNumber(prefix, quote.number)}</Text>
            {stamp && <Text style={s.stamp}>{stamp}</Text>}
          </View>
        </View>

        <View style={[s.row, s.block]}>
          <View>
            <Text style={s.label}>{t.preparedFor}</Text>
            <Text style={s.bold}>{customerName}</Text>
            {address !== "" && <Text style={s.muted}>{address}</Text>}
            {c.email && <Text style={s.muted}>{c.email}</Text>}
            {c.phone && <Text style={s.muted}>{c.phone}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text><Text style={s.muted}>{t.date}: </Text>{d(quote.issue_date)}</Text>
            <Text><Text style={s.muted}>{t.valid}: </Text>{d(quote.expires_on)}</Text>
            {quote.serviceName && <Text><Text style={s.muted}>{t.service}: </Text>{quote.serviceName}</Text>}
          </View>
        </View>
        {quote.title && <Text style={[s.bold, { marginTop: 14, fontSize: 12 }]}>{quote.title}</Text>}

        {shown.map((o) => (
          <View key={o.id} style={s.tier} wrap={false}>
            <View style={s.row}><Text style={[s.bold, { fontSize: 12 }]}>{o.name}</Text><Text style={s.bold}>{m(o.base_price_cents)}</Text></View>
            {o.description && <Text style={s.muted}>{o.description}</Text>}
            {quote.options.length > 1 && !quote.selected_option_id && totalsBox(o.id)}
          </View>
        ))}

        {quote.lines.length > 0 && (
          <View style={s.block}>
            {shown.length > 0 && <Text style={[s.bold, { marginBottom: 4 }]}>{t.extras}</Text>}
            <View style={s.th}><Text style={s.c1}>{t.description}</Text><Text style={s.c2}>{t.qty}</Text><Text style={s.c3}>{t.unit}</Text><Text style={s.c4}>{t.amount}</Text></View>
            {quote.lines.map((l) => (
              <View key={l.id} style={s.tr} wrap={false}>
                <Text style={s.c1}>{l.description}</Text><Text style={s.c2}>{l.quantity}</Text>
                <Text style={s.c3}>{m(l.unit_price_cents)}</Text><Text style={s.c4}>{m(money(l.unit_price_cents, l.quantity))}</Text>
              </View>
            ))}
            {extras > 0 && quote.options.length > 1 && !quote.selected_option_id && <Text style={[s.muted, { marginTop: 4 }]}>{t.includes}: {m(extras)}</Text>}
          </View>
        )}

        {(quote.options.length <= 1 || quote.selected_option_id) && totalsBox(shown[0]?.id ?? null)}

        {quote.notes && <View style={s.block}><Text style={s.label}>{t.notes}</Text><Text>{quote.notes}</Text></View>}
        {quote.terms && <View style={s.block}><Text style={s.label}>{t.terms}</Text><Text style={[s.muted, { fontSize: 8 }]}>{quote.terms}</Text></View>}
      </Page>
    </Document>
  );
}
