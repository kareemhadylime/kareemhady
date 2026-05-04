import 'server-only';
import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer';

// Register fonts to match the printed BH menu's typography
Font.register({
  family: 'Cormorant',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3YmX5slCNuHLi8bLeY9MK7whWMhyjornFLsS6V7w.ttf', fontWeight: 500 },
    { src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3YmX5slCNuHLi8bLeY9MK7whWMhyjorvFLsS6V7w.ttf', fontWeight: 600 },
  ],
});
Font.register({
  family: 'Poppins',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/poppins/v20/pxiEyp8kv8JHgFVrJJfecnFHGPc.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/poppins/v20/pxiByp8kv8JHgFVrLGT9Z1xlFd2JQEk.ttf', fontWeight: 600 },
  ],
});
Font.register({
  family: 'Cairo',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/cairo/v28/SLXGc1nY6HkvalIvTp2mxdt0UX8.ttf', fontWeight: 400 },
  ],
});

const NAVY = '#0F3F58';
const CREAM = '#E9E5DE';
const CORAL = '#E5A29C';
const INK_MUTED = '#4A6577';

const styles = StyleSheet.create({
  page: {
    backgroundColor: CREAM,
    paddingHorizontal: 36,
    paddingVertical: 36,
    fontFamily: 'Poppins',
    fontSize: 10,
    color: NAVY,
  },
  pageAr: { fontFamily: 'Cairo' },
  rail: {
    position: 'absolute',
    top: 0, bottom: 0, width: 1.5,
    backgroundColor: CORAL,
  },
  brandRow: { textAlign: 'center', marginBottom: 12 },
  brand: {
    fontFamily: 'Cormorant',
    fontWeight: 600,
    fontSize: 22,
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    letterSpacing: 1,
    marginTop: 2,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: NAVY,
    marginVertical: 12,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 9,
    color: INK_MUTED,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 0.4,
    borderBottomColor: '#dcd6cc',
  },
  itemName: { fontWeight: 600, flex: 1 },
  itemPrice: { fontWeight: 600 },
  itemMod: { fontSize: 8, color: INK_MUTED, marginLeft: 12 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    fontSize: 9,
    color: INK_MUTED,
  },
  totalGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: NAVY,
    fontWeight: 600,
    fontSize: 12,
  },
  fineprint: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 8,
    color: INK_MUTED,
    fontStyle: 'italic',
  },
});

const T = {
  en: {
    inroom: 'IN-ROOM DINING', receipt: 'RECEIPT',
    order: 'Order', unit: 'Unit', date: 'Date', subtotal: 'Subtotal',
    vat: 'VAT (14%, included)', service: 'Service (12%, included)',
    total: 'Total', payment: 'Charged to your room — settled at checkout.',
    fineprint: 'All prices are inclusive of 14% VAT & 12% Service Charge',
    thanks: 'Thank you for staying at Beit Hady.',
  },
  ar: {
    inroom: 'الطعام في الغرفة', receipt: 'فاتورة',
    order: 'طلب', unit: 'وحدة', date: 'تاريخ', subtotal: 'المجموعالفرعي',
    vat: 'ضريبة القيمة المضافة (14٪، شامل)', service: 'خدمة (12٪، شامل)',
    total: 'الإجمالي', payment: 'محمل على غرفتك — يُسوّى عند المغادرة.',
    fineprint: 'جميع الأسعار شاملة 14٪ ضريبة قيمة مضافة و12٪ رسم خدمة',
    thanks: 'شكراً لإقامتك في بيت هادي.',
  },
  ru: {
    inroom: 'ОБСЛУЖИВАНИЕ В НОМЕРЕ', receipt: 'ЧЕК',
    order: 'Заказ', unit: 'Номер', date: 'Дата', subtotal: 'Промежуточный итог',
    vat: 'НДС (14%, включён)', service: 'Сервис (12%, включён)',
    total: 'Итого', payment: 'Списано с вашего счёта — оплата при выезде.',
    fineprint: 'Все цены включают 14% НДС и 12% сервисный сбор',
    thanks: 'Спасибо за выбор Beit Hady.',
  },
  fr: {
    inroom: 'SERVICE EN CHAMBRE', receipt: 'REÇU',
    order: 'Commande', unit: 'Unité', date: 'Date', subtotal: 'Sous-total',
    vat: 'TVA (14%, incluse)', service: 'Service (12%, inclus)',
    total: 'Total', payment: 'Facturé à votre chambre — réglé au départ.',
    fineprint: 'Tous les prix incluent 14% de TVA et 12% de frais de service',
    thanks: 'Merci de séjourner à Beit Hady.',
  },
};

export interface ReceiptDocProps {
  order: {
    order_number: number;
    building_code: string;
    unit_code: string;
    guest_name: string | null;
    guest_language: 'en'|'ar'|'ru'|'fr';
    submitted_at: string;
    delivered_at: string | null;
    subtotal_usd: number | string;
    vat_usd: number | string;
    service_usd: number | string;
    total_usd: number | string;
  };
  lines: Array<{
    item_name_snapshot: string;
    quantity: number;
    line_total_usd: number | string;
    modifier_snapshot: Array<{ name_localized: string }>;
    notes: string | null;
  }>;
  vatLine?: string | null;
}

export function ReceiptDoc({ order, lines, vatLine }: ReceiptDocProps) {
  const lang = order.guest_language;
  const t = T[lang];

  return (
    <Document>
      <Page size="A5" style={lang === 'ar' ? [styles.page, styles.pageAr] : styles.page}>
        <View style={[styles.rail, { left: 18 }]} />
        <View style={[styles.rail, { right: 18 }]} />

        <View style={styles.brandRow}>
          <Text style={styles.brand}>BEIT HADY</Text>
          <Text style={styles.subtitle}>{t.inroom} · {t.receipt}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.meta}>
          <Text>{t.order} #{String(order.order_number).padStart(4, '0')}</Text>
          <Text>{order.building_code} · {t.unit} {order.unit_code}</Text>
        </View>
        <View style={styles.meta}>
          <Text>{order.guest_name ?? '—'}</Text>
          <Text>{t.date} {new Date(order.delivered_at ?? order.submitted_at).toLocaleString(lang)}</Text>
        </View>

        <View style={styles.divider} />

        {lines.map((l, i) => (
          <View key={i}>
            <View style={styles.itemRow}>
              <Text style={styles.itemName}>{l.quantity} × {l.item_name_snapshot}</Text>
              <Text style={styles.itemPrice}>${Number(l.line_total_usd).toFixed(2)}</Text>
            </View>
            {l.modifier_snapshot.map((m, j) => (
              <Text key={j} style={styles.itemMod}>+ {m.name_localized}</Text>
            ))}
            {l.notes && <Text style={styles.itemMod}>"{l.notes}"</Text>}
          </View>
        ))}

        <View style={{ marginTop: 12 }}>
          <View style={styles.totalRow}>
            <Text>{t.subtotal}</Text><Text>${Number(order.subtotal_usd).toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>{t.vat}</Text><Text>${Number(order.vat_usd).toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>{t.service}</Text><Text>${Number(order.service_usd).toFixed(2)}</Text>
          </View>
          <View style={styles.totalGrand}>
            <Text>{t.total}</Text><Text>${Number(order.total_usd).toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.fineprint}>{t.payment}</Text>
        {vatLine && <Text style={styles.fineprint}>{vatLine}</Text>}
        <Text style={styles.fineprint}>{t.fineprint}</Text>
        <Text style={[styles.fineprint, { marginTop: 14 }]}>{t.thanks}</Text>
      </Page>
    </Document>
  );
}
