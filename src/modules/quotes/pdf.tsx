import { Document, Image as PdfImage, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { addressLines, displayUrl } from "@/lib/business";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney, quoteNumber } from "@/lib/money";
import { DEFAULT_BRAND, LOGO_DIMS, type LogoSize } from "@/lib/brand-color";
import type { QuoteDetail } from "./queries";

const L = {
  en: {
    quote: "QUOTE", preparedFor: "PREPARED FOR", date: "Date", valid: "Valid until", service: "Service", number: "Quote #",
    description: "Description", qty: "Qty", rate: "Rate", amount: "Amount", subtotal: "Subtotal", discount: "Discount",
    tax: "Tax", total: "Total", notes: "Notes", terms: "TERMS & CONDITIONS", extras: "Additional items", includes: "Includes",
    thanks: "Thank you for considering us!", accepted: "ACCEPTED", declined: "DECLINED", expired: "EXPIRED", chosen: "Selected",
  },
  es: {
    quote: "COTIZACIÓN", preparedFor: "PREPARADA PARA", date: "Fecha", valid: "Válida hasta", service: "Servicio", number: "Cotización #",
    description: "Descripción", qty: "Cant.", rate: "Precio", amount: "Importe", subtotal: "Subtotal", discount: "Descuento",
    tax: "Impuesto", total: "Total", notes: "Notas", terms: "TÉRMINOS Y CONDICIONES", extras: "Conceptos adicionales", includes: "Incluye",
    thanks: "¡Gracias por considerarnos!", accepted: "ACEPTADA", declined: "RECHAZADA", expired: "VENCIDA", chosen: "Elegida",
  },
} as const;

const GREEN = "#15803d";
const RED = "#c62828";
const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#d1d5db";

/** Styles depend on the company's brand color (`TEAL` below is that color) and on how big its logo is. */
const makeStyles = (TEAL: string, logoBox: { h: number; w: number }) => StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 50, paddingHorizontal: 44, fontSize: 10, fontFamily: "Helvetica", color: INK },
  row: { flexDirection: "row", justifyContent: "space-between" },
  logo: { maxHeight: logoBox.h, maxWidth: logoBox.w, objectFit: "contain", objectPositionX: 0 },
  logoBox: { width: 48, height: 48, borderRadius: 8, backgroundColor: TEAL, alignItems: "center", justifyContent: "center" },
  logoLetter: { color: "#ffffff", fontSize: 24, fontFamily: "Helvetica-Bold" },
  biz: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: MUTED, marginBottom: 2 },
  pill: { alignSelf: "flex-end", borderRadius: 10, paddingVertical: 3, paddingHorizontal: 12, color: "#ffffff", fontSize: 9, fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 24, fontFamily: "Helvetica-Bold", color: TEAL, marginTop: 8, marginBottom: 6, textAlign: "right" },
  meta: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3 },
  metaLabel: { color: MUTED, width: 64, textAlign: "right", paddingRight: 8 },
  metaValue: { width: 66, textAlign: "right", fontFamily: "Helvetica-Bold" },
  divider: { borderBottomWidth: 1, borderBottomColor: LINE, marginTop: 18, marginBottom: 14 },
  billLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  customer: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "right", marginBottom: 3 },
  right: { textAlign: "right", color: MUTED, marginBottom: 2 },
  th: { flexDirection: "row", backgroundColor: TEAL, color: "#ffffff", paddingVertical: 6, paddingHorizontal: 8, fontFamily: "Helvetica-Bold", marginTop: 6 },
  tr: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: LINE },
  c1: { flex: 5 }, c2: { flex: 1, textAlign: "right" }, c3: { flex: 1.6, textAlign: "right" }, c4: { flex: 1.6, textAlign: "right" },
  totals: { marginTop: 8, alignSelf: "flex-end", width: 230 },
  tl: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: LINE },
  grand: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, paddingHorizontal: 8, marginTop: 4, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 11, backgroundColor: TEAL },
  bold: { fontFamily: "Helvetica-Bold" },
  tier: { marginTop: 10, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10 },
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 20, marginBottom: 6 },
  termsTitle: { textAlign: "center", fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 26 },
  terms: { textAlign: "center", color: MUTED, fontSize: 8, lineHeight: 1.5, marginTop: 4 },
  thanks: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 14 },
});

export type PdfBusiness = { name: string; phone: string | null; email: string | null; address: string | null; tax_id: string | null; website?: string | null };
export type PdfLogo = { data: Buffer; format: "png" | "jpg" } | null;

export function QuotePdf({
  quote, business, logo, brand, logoSize, prefix, currency, dateFormat, locale,
}: { quote: QuoteDetail; business: PdfBusiness; logo?: PdfLogo; brand?: string | null; logoSize?: LogoSize; prefix: string; currency: string; dateFormat: string; locale: "en" | "es" }) {
  const t = L[locale];
  const TEAL = brand ?? DEFAULT_BRAND;
  const dims = LOGO_DIMS[logoSize ?? "medium"];
  const s = makeStyles(TEAL, dims);
  const m = (c: number) => formatMoney(c, currency);
  const d = (v: string) => formatDateOnly(v, dateFormat);
  const c = quote.customer;
  const person = `${c.first_name} ${c.last_name}`.trim();
  const company = c.company_name.trim();
  const address = [c.service_address, [c.city, c.state].filter(Boolean).join(", "), c.zip_code].filter(Boolean).join(", ");
  const money = (cents: number, line: number) => Math.round(line * cents);
  const extras = quote.lines.reduce((sum, l) => sum + money(l.unit_price_cents, l.quantity), 0);
  const st = quote.display_status;
  const label = st === "accepted" ? t.accepted : st === "declined" ? t.declined : st === "expired" ? t.expired : null;
  const color = st === "accepted" ? GREEN : RED;
  const totalFor = (optionId: string | null) => quote.totals.find((x) => x.option_id === optionId);
  // After acceptance only the chosen option is shown; otherwise every option is offered side by side.
  const shown = quote.selected_option_id ? quote.options.filter((o) => o.id === quote.selected_option_id) : quote.options;
  const compare = quote.options.length > 1 && !quote.selected_option_id;

  const totalsBox = (optionId: string | null) => {
    const x = totalFor(optionId);
    if (!x) return null;
    return (
      <View style={s.totals} wrap={false}>
        <View style={s.tl}><Text style={{ color: MUTED }}>{t.subtotal}</Text><Text>{m(x.subtotal_cents)}</Text></View>
        {x.discount_cents > 0 && <View style={s.tl}><Text style={{ color: MUTED }}>{t.discount}</Text><Text>-{m(x.discount_cents)}</Text></View>}
        {quote.tax_rate > 0 && <View style={s.tl}><Text style={{ color: MUTED }}>{t.tax} ({quote.tax_rate}%)</Text><Text>{m(x.tax_cents)}</Text></View>}
        <View style={s.grand}><Text>{t.total}</Text><Text>{m(x.total_cents)}</Text></View>
      </View>
    );
  };

  return (
    <Document title={`${quoteNumber(prefix, quote.number)} - ${business.name}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.row}>
          <View style={{ width: `${dims.left}%` }}>
            {logo ? <PdfImage src={{ data: logo.data, format: logo.format }} style={s.logo} /> : <View style={s.logoBox}><Text style={s.logoLetter}>{business.name.trim().charAt(0).toUpperCase() || "B"}</Text></View>}
          </View>
          <View style={{ width: `${dims.mid}%` }}>
            <Text style={s.biz}>{business.name}</Text>
            {business.address && <Text style={s.muted}>{business.address}</Text>}
            {business.phone && <Text style={s.muted}>{business.phone}</Text>}
            {business.email && <Text style={s.muted}>{business.email}</Text>}
            {business.website && <Text style={s.muted}>{displayUrl(business.website)}</Text>}
            {business.tax_id && <Text style={s.muted}>{business.tax_id}</Text>}
          </View>
          <View style={{ width: `${dims.right}%` }}>
            {label && <Text style={[s.pill, { backgroundColor: color }]}>{label}</Text>}
            <Text style={s.h1}>{t.quote}</Text>
            <View style={s.meta}><Text style={s.metaLabel}>{t.number}</Text><Text style={s.metaValue}>{quoteNumber(prefix, quote.number)}</Text></View>
            <View style={s.meta}><Text style={s.metaLabel}>{t.date}</Text><Text style={s.metaValue}>{d(quote.issue_date)}</Text></View>
            <View style={s.meta}><Text style={s.metaLabel}>{t.valid}</Text><Text style={s.metaValue}>{d(quote.expires_on)}</Text></View>
          </View>
        </View>

        <View style={s.divider} />

        <View style={[s.row, { minHeight: 70 }]}>
          <Text style={s.billLabel}>{t.preparedFor}</Text>
          <View style={{ maxWidth: 300 }}>
            {company && person && company.toLowerCase() !== person.toLowerCase() ? (
              <>
                <Text style={s.customer}>{company}</Text>
                <Text style={[s.right, { fontSize: 12, color: INK }]}>{person}</Text>
              </>
            ) : (
              <Text style={s.customer}>{company || person}</Text>
            )}
            {addressLines(address).map((l) => <Text key={l} style={s.right}>{l}</Text>)}
            {c.email && <Text style={s.right}>{c.email}</Text>}
            {c.phone && <Text style={s.right}>{c.phone}</Text>}
          </View>
        </View>

        {(quote.title || quote.serviceName) && (
          <View style={{ marginBottom: 4 }}>
            {quote.title && <Text style={[s.bold, { fontSize: 13 }]}>{quote.title}</Text>}
            {quote.serviceName && <Text style={{ color: MUTED }}>{t.service}: {quote.serviceName}</Text>}
          </View>
        )}

        {shown.map((o) => (
          <View key={o.id} style={s.tier} wrap={false}>
            <View style={s.row}>
              <Text style={[s.bold, { fontSize: 12 }]}>{o.name}{quote.selected_option_id === o.id ? `  ·  ${t.chosen}` : ""}</Text>
              <Text style={s.bold}>{m(o.base_price_cents)}</Text>
            </View>
            {o.description && <Text style={{ color: MUTED, marginTop: 3 }}>{o.description}</Text>}
            {compare && totalsBox(o.id)}
          </View>
        ))}

        {quote.lines.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>{t.extras}</Text>
            <View style={s.th}><Text style={s.c1}>{t.description}</Text><Text style={s.c2}>{t.qty}</Text><Text style={s.c3}>{t.rate}</Text><Text style={s.c4}>{t.amount}</Text></View>
            {quote.lines.map((l) => (
              <View key={l.id} style={s.tr} wrap={false}>
                <Text style={s.c1}>{l.description}</Text><Text style={s.c2}>{l.quantity}</Text>
                <Text style={s.c3}>{m(l.unit_price_cents)}</Text><Text style={[s.c4, s.bold]}>{m(money(l.unit_price_cents, l.quantity))}</Text>
              </View>
            ))}
            {extras > 0 && compare && <Text style={{ color: MUTED, marginTop: 4 }}>{t.includes}: {m(extras)}</Text>}
          </View>
        )}

        {!compare && totalsBox(shown[0]?.id ?? null)}

        {quote.notes && <View wrap={false}><Text style={s.sectionTitle}>{t.notes}</Text><Text style={{ color: MUTED }}>{quote.notes}</Text></View>}
        {quote.terms && <View wrap={false}><Text style={s.termsTitle}>{t.terms}</Text><Text style={s.terms}>{quote.terms}</Text></View>}
        <Text style={s.thanks}>{t.thanks}</Text>
      </Page>
    </Document>
  );
}
