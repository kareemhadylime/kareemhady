import 'server-only';
import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer';

const NAVY = '#0F3F58';
const CREAM = '#E9E5DE';
const INK_MUTED = '#4A6577';

const styles = StyleSheet.create({
  page: { backgroundColor: CREAM, padding: 36, fontSize: 10, color: NAVY },
  brand: { fontSize: 18, fontWeight: 600, marginBottom: 4, letterSpacing: 1 },
  subtitle: { fontSize: 11, color: INK_MUTED, marginBottom: 16 },
  divider: { borderBottomWidth: 0.5, borderBottomColor: NAVY, marginVertical: 8 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: { width: '24%', padding: 6, borderWidth: 0.5, borderColor: '#dcd6cc' },
  kpiLabel: { fontSize: 8, textTransform: 'uppercase', color: INK_MUTED },
  kpiValue: { fontSize: 14, fontWeight: 600, marginTop: 2 },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.3,
    borderBottomColor: '#dcd6cc',
  },
  tableHeader: { fontWeight: 600, backgroundColor: '#f0ebe2', paddingVertical: 4 },
  tCol: { fontSize: 9 },
});

export interface AnalyticsDocProps {
  generatedAt: string;
  windowDays: number;
  summary: {
    today: { revenue_usd: number; orders: number; avg_ticket_usd: number };
    yesterday: { revenue_usd: number; orders: number };
    avg_prep_minutes: number | null;
    top_item: { name: string; count: number; revenue_usd: number } | null;
  };
  orders: Array<{
    order_number: number;
    building_code: string;
    unit_code: string;
    status: string;
    submitted_at: string;
    total_usd: number | string;
  }>;
}

export function AnalyticsDoc({ generatedAt, windowDays, summary, orders }: AnalyticsDocProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>BEIT HADY · F&B Analytics</Text>
        <Text style={styles.subtitle}>
          Window: last {windowDays} days · Generated {generatedAt}
        </Text>
        <View style={styles.kpiGrid}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Revenue today</Text>
            <Text style={styles.kpiValue}>${summary.today.revenue_usd.toFixed(2)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Orders today</Text>
            <Text style={styles.kpiValue}>{summary.today.orders}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Avg ticket</Text>
            <Text style={styles.kpiValue}>${summary.today.avg_ticket_usd.toFixed(2)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Avg prep (min)</Text>
            <Text style={styles.kpiValue}>{summary.avg_prep_minutes ?? '—'}</Text>
          </View>
        </View>

        {summary.top_item && (
          <View style={[styles.kpi, { width: '100%', marginTop: 8 }]}>
            <Text style={styles.kpiLabel}>Top item this period</Text>
            <Text style={styles.kpiValue}>{summary.top_item.name}</Text>
            <Text style={styles.tCol}>{summary.top_item.count} sold · ${summary.top_item.revenue_usd.toFixed(2)} revenue</Text>
          </View>
        )}

        <View style={styles.divider} />

        <View style={[styles.tableRow, styles.tableHeader]}>
          <Text style={[styles.tCol, { width: '12%' }]}>Order</Text>
          <Text style={[styles.tCol, { width: '13%' }]}>Building</Text>
          <Text style={[styles.tCol, { width: '13%' }]}>Unit</Text>
          <Text style={[styles.tCol, { width: '15%' }]}>Status</Text>
          <Text style={[styles.tCol, { width: '32%' }]}>Submitted</Text>
          <Text style={[styles.tCol, { width: '15%', textAlign: 'right' }]}>Total</Text>
        </View>
        {orders.slice(0, 200).map((o, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.tCol, { width: '12%' }]}>#{String(o.order_number).padStart(4, '0')}</Text>
            <Text style={[styles.tCol, { width: '13%' }]}>{o.building_code}</Text>
            <Text style={[styles.tCol, { width: '13%' }]}>{o.unit_code}</Text>
            <Text style={[styles.tCol, { width: '15%' }]}>{o.status}</Text>
            <Text style={[styles.tCol, { width: '32%' }]}>{new Date(o.submitted_at).toLocaleString()}</Text>
            <Text style={[styles.tCol, { width: '15%', textAlign: 'right' }]}>${Number(o.total_usd).toFixed(2)}</Text>
          </View>
        ))}
        {orders.length > 200 && (
          <Text style={[styles.tCol, { marginTop: 6, color: INK_MUTED }]}>
            … {orders.length - 200} more rows truncated. Use CSV export for full data.
          </Text>
        )}
      </Page>
    </Document>
  );
}
