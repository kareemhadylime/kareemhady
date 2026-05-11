// Beithady · Fee Audit · A4 PDF render via @react-pdf/renderer.

import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { FeeAuditData } from './types';
import { FEE_CATEGORY_LABEL, ANOMALY_LABEL } from './types';

const PALETTE = {
  ink: '#1a2c47',
  ink2: '#374b6b',
  muted: '#7a8aa3',
  line: '#e6dfce',
  brand: '#003462',
  brandBg: '#f0e9d9',
  green: '#15803d',
  amber: '#b45309',
  red: '#b91c1c',
  cardBg: '#faf8f3',
};

let _logoBytes: Buffer | null = null;
function getLogoBytes(): Buffer | null {
  if (_logoBytes) return _logoBytes;
  try {
    _logoBytes = readFileSync(
      join(process.cwd(), 'public', 'brand', 'beithady', 'logo-stacked.jpg')
    );
    return _logoBytes;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: 'Helvetica', color: PALETTE.ink },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: PALETTE.brand,
    marginBottom: 12,
  },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: PALETTE.brand },
  subtitle: { fontSize: 9, color: PALETTE.muted, marginTop: 4 },
  sectionTitle: {
    fontSize: 11, fontFamily: 'Helvetica-Bold', color: PALETTE.brand,
    marginTop: 12, marginBottom: 6,
  },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kpiCard: {
    width: '32%', padding: 8, backgroundColor: PALETTE.cardBg,
    borderWidth: 1, borderColor: PALETTE.line, borderRadius: 3,
  },
  kpiLabel: { fontSize: 8, color: PALETTE.muted, textTransform: 'uppercase' },
  kpiValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: PALETTE.brand, marginTop: 2 },
  table: { width: '100%', marginTop: 4 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: PALETTE.line },
  th: {
    padding: 4, fontSize: 7, fontFamily: 'Helvetica-Bold', color: PALETTE.brand,
    backgroundColor: PALETTE.brandBg, flex: 1, textAlign: 'right',
  },
  thFirst: { textAlign: 'left', flex: 2 },
  td: { padding: 4, fontSize: 7, color: PALETTE.ink, flex: 1, textAlign: 'right' },
  tdFirst: { textAlign: 'left', fontFamily: 'Helvetica-Bold', flex: 2 },
  bullet: { flexDirection: 'row', marginBottom: 4 },
  bulletDot: { width: 14, fontSize: 9 },
  bulletText: { flex: 1, fontSize: 8, lineHeight: 1.4 },
  footer: {
    position: 'absolute', bottom: 14, left: 28, right: 28,
    flexDirection: 'row', justifyContent: 'space-between',
    fontSize: 7, color: PALETTE.muted,
  },
});

function fmtUsd(v: number | null | undefined): string {
  if (v == null) return '—';
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

export async function renderFeeAuditPdf(data: FeeAuditData): Promise<Buffer> {
  const logo = getLogoBytes();
  const { config, listings, totals, anomalies, daily } = data;

  const doc = (
    <Document title="Booking-Channel Fee Audit" author="Beit Hady">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.title}>Booking-Channel Fee Audit</Text>
            <Text style={styles.subtitle}>
              Window: {config.startDate} → +{config.windowDays}d ·
              Buildings: {config.buildings.length ? config.buildings.join(', ') : 'All'} ·
              Channels: {config.channels.length ? config.channels.join(', ') : 'All'}
            </Text>
          </View>
          {logo ? <Image src={logo} style={{ width: 50, height: 50 }} /> : null}
        </View>

        <Text style={styles.sectionTitle}>Key metrics</Text>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Avg Daily Rate</Text>
            <Text style={styles.kpiValue}>{fmtUsd(totals.avg_daily_rate_usd)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Avg Cleaning</Text>
            <Text style={styles.kpiValue}>{fmtUsd(totals.avg_cleaning_usd)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Avg Tax %</Text>
            <Text style={styles.kpiValue}>
              {totals.avg_total_tax_pct != null
                ? `${totals.avg_total_tax_pct.toFixed(1)}%`
                : '—'}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Avg Min Nights</Text>
            <Text style={styles.kpiValue}>
              {totals.avg_min_nights != null ? totals.avg_min_nights.toFixed(1) : '—'}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Missing Data</Text>
            <Text style={styles.kpiValue}>{totals.listings_with_missing_data}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Anomalies</Text>
            <Text style={styles.kpiValue}>
              {totals.anomaly_count_by_severity.critical} 🔴 ·{' '}
              {totals.anomaly_count_by_severity.warning} 🟡
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Listings cross-reference</Text>
        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.th, styles.thFirst]}>Listing</Text>
            <Text style={styles.th}>BR/BA</Text>
            <Text style={styles.th}>Cap</Text>
            <Text style={styles.th}>Cleaning</Text>
            <Text style={styles.th}>Min N</Text>
            <Text style={styles.th}>Tax %</Text>
            <Text style={styles.th}>Avg Daily</Text>
          </View>
          {listings.slice(0, 35).map(l => {
            const taxPct = l.taxes
              .filter(t => typeof t.rate_pct === 'number')
              .reduce((s, t) => s + (t.rate_pct || 0), 0);
            const avgDaily =
              avg(daily.filter(d => d.listing_id === l.id).map(d => d.base_price_usd)) ||
              null;
            const cleanColor =
              !l.cleaning_fee || l.cleaning_fee === 0 ? PALETTE.red : PALETTE.ink;
            return (
              <View key={l.id} style={styles.tr} wrap={false}>
                <Text style={[styles.td, styles.tdFirst]}>{l.nickname} · {l.building}</Text>
                <Text style={styles.td}>
                  {l.bedrooms} BR / {l.bathrooms ?? '—'} BA
                </Text>
                <Text style={styles.td}>{l.capacity}</Text>
                <Text style={[styles.td, { color: cleanColor }]}>
                  {fmtUsd(l.cleaning_fee)}
                </Text>
                <Text style={styles.td}>{l.min_nights_default ?? '—'}</Text>
                <Text style={styles.td}>{taxPct ? `${taxPct.toFixed(1)}%` : '—'}</Text>
                <Text style={styles.td}>{fmtUsd(avgDaily)}</Text>
              </View>
            );
          })}
        </View>

        <View break>
          <Text style={styles.sectionTitle}>
            Anomalies ({anomalies.length})
          </Text>
          {anomalies.length === 0 ? (
            <Text style={{ fontSize: 9, color: PALETTE.green }}>
              ✓ No anomalies detected.
            </Text>
          ) : (
            anomalies.map((a, i) => (
              <View key={i} style={styles.bullet}>
                <Text style={styles.bulletDot}>
                  {a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : '🔵'}
                </Text>
                <Text style={styles.bulletText}>
                  [{ANOMALY_LABEL[a.kind]}] {a.message}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text>Beit Hady · Confidential · Fee Audit</Text>
          <Text
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}

function avg(nums: Array<number | null | undefined>): number | null {
  const v = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}
