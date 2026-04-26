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
import {
  BUILDING_CODES,
  BUILDING_LABEL,
  type BuildingBucket,
  type BuildingCode,
  type DailyReportPayload,
} from './types';

// A4 PDF render via @react-pdf/renderer. Server-side (Node), no Chromium
// needed. Mirrors the HTML report structure but uses @react-pdf primitives.

// BeitHady brand palette (matches render-html.tsx — deep navy + warm gold).
const PALETTE = {
  ink: '#1a2c47',
  ink2: '#374b6b',
  muted: '#7a8aa3',
  line: '#e6dfce',
  brand: '#1e3a5f',
  brandBg: '#f0e9d9',
  green: '#15803d',
  amber: '#b45309',
  red: '#b91c1c',
  gold: '#c9a96e',
  cardBg: '#faf8f3',
};

// Load logo bytes once per cold start. The file lives in `public/` so it
// ships with the Vercel deployment. Reading at module-init keeps render
// fast on warm invocations.
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
  page: {
    padding: 28,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: PALETTE.ink,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: PALETTE.brand,
    marginBottom: 8,
  },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: PALETTE.brand },
  subtitle: { fontSize: 8, color: PALETTE.muted, marginTop: 2 },
  digestBox: {
    padding: 8,
    backgroundColor: PALETTE.brandBg,
    borderWidth: 1,
    borderColor: '#67e8f9',
    borderRadius: 3,
    fontSize: 9,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.brand,
    letterSpacing: 1,
    marginBottom: 4,
  },
  table: { display: 'flex', flexDirection: 'column', width: '100%' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: PALETTE.line },
  th: {
    flex: 1,
    padding: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: PALETTE.ink2,
    textAlign: 'right',
  },
  thLeft: {
    flex: 2,
    padding: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: PALETTE.ink2,
    textAlign: 'left',
  },
  td: {
    flex: 1,
    padding: 3,
    fontSize: 7.5,
    color: PALETTE.ink,
    textAlign: 'right',
  },
  tdLeft: {
    flex: 2,
    padding: 3,
    fontSize: 7.5,
    color: PALETTE.ink2,
    textAlign: 'left',
  },
  tdAll: {
    flex: 1,
    padding: 3,
    fontSize: 7.5,
    color: PALETTE.brand,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    backgroundColor: PALETTE.brandBg,
  },
  thAll: {
    flex: 1,
    padding: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: PALETTE.brand,
    textAlign: 'right',
    backgroundColor: PALETTE.brandBg,
  },
  sectionRow: {
    paddingTop: 4,
    paddingBottom: 1,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.brand,
    letterSpacing: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: PALETTE.line,
  },
  card: {
    marginTop: 8,
    padding: 6,
    borderWidth: 0.5,
    borderColor: PALETTE.line,
    borderRadius: 3,
  },
  cardYellow: {
    marginTop: 8,
    padding: 6,
    borderWidth: 0.5,
    borderColor: PALETTE.gold,
    backgroundColor: '#fffbeb',
    borderRadius: 3,
  },
  payoutsRow: { flexDirection: 'row', borderBottomWidth: 0.3, borderBottomColor: PALETTE.line, paddingVertical: 2 },
  reviewItem: {
    padding: 4,
    marginVertical: 1,
    borderLeftWidth: 2,
  },
  starGrid: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  starCell: {
    flex: 1,
    padding: 3,
    backgroundColor: PALETTE.cardBg,
    borderRadius: 2,
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: PALETTE.line,
    fontSize: 6.5,
    color: PALETTE.muted,
    textAlign: 'center',
  },
});

const fmtUsd = (n: number): string => {
  if (n == null || !Number.isFinite(n)) return '$0';
  if (Math.abs(n) >= 100000) return '$' + Math.round(n / 1000) + 'k';
  if (Math.abs(n) >= 10000) return '$' + (n / 1000).toFixed(1) + 'k';
  return '$' + Math.round(n).toLocaleString('en-US');
};
const fmtNum = (n: number, dp = 0): string =>
  n == null || !Number.isFinite(n) ? '0' : n.toFixed(dp);
const fmtPct = (n: number, dp = 1): string => n.toFixed(dp) + '%';

function pctColor(p: number): string {
  if (p >= 85) return PALETTE.green;
  if (p >= 70) return PALETTE.amber;
  return PALETTE.red;
}

function pickupColor(p: number): string {
  if (p > 0) return PALETTE.green;
  if (p < 0) return PALETTE.red;
  return PALETTE.muted;
}

function BuildingsTablePdf({ payload }: { payload: DailyReportPayload }) {
  const cols: { key: 'all' | BuildingCode; label: string; bucket: BuildingBucket; isAll: boolean }[] = [
    { key: 'all', label: 'All', bucket: payload.all, isAll: true },
    ...BUILDING_CODES.map(c => ({
      key: c,
      label: BUILDING_LABEL[c],
      bucket: payload.per_building[c],
      isAll: false,
    })),
  ];

  const rows: { label: string; section?: string; val: (b: BuildingBucket) => { text: string; color?: string; bold?: boolean } }[] = [
    { section: 'TODAY', label: 'Total units', val: b => ({ text: fmtNum(b.total_units) }) },
    { label: 'Occupied today', val: b => ({ text: fmtNum(b.occupied_today) }) },
    {
      label: 'Occupancy %',
      val: b => ({ text: fmtPct(b.occupancy_today_pct), color: pctColor(b.occupancy_today_pct), bold: true }),
    },
    { label: 'Check-ins', val: b => ({ text: fmtNum(b.check_ins_today) }) },
    { label: 'Check-outs', val: b => ({ text: fmtNum(b.check_outs_today) }) },
    { label: 'Turnovers', val: b => ({ text: fmtNum(b.turnovers_today) }) },
    {
      section: 'MONTH-TO-DATE',
      label: 'Revenue MTD',
      val: b => ({ text: fmtUsd(b.revenue_mtd_usd), bold: true }),
    },
    {
      label: 'Forward occupancy',
      val: b => ({ text: fmtPct(b.forward_occupancy_pct), color: pctColor(b.forward_occupancy_pct) }),
    },
    {
      label: 'Backward occupancy',
      val: b => ({ text: fmtPct(b.backward_occupancy_pct), color: pctColor(b.backward_occupancy_pct) }),
    },
    {
      label: 'Avg units / day',
      val: b => ({ text: fmtNum(b.backward_avg_units_per_day, 1) }),
    },
    { label: 'ADR (USD)', val: b => ({ text: fmtUsd(b.adr_mtd_usd) }) },
    { label: 'Opp. nights', val: b => ({ text: fmtNum(b.opportunity_nights) }) },
    { label: 'Opp. value', val: b => ({ text: fmtUsd(b.opportunity_value_usd) }) },
    {
      section: 'PACE & STAY',
      label: 'Bookings / day',
      val: b => ({ text: fmtNum(b.bookings_per_day_mtd, 1) }),
    },
    { label: 'Lead time (d)', val: b => ({ text: fmtNum(b.avg_lead_time_days, 1) }) },
    {
      label: 'Pickup vs prior',
      val: b => ({
        text: (b.pickup_vs_prior_month_pct > 0 ? '+' : '') + fmtPct(b.pickup_vs_prior_month_pct),
        color: pickupColor(b.pickup_vs_prior_month_pct),
      }),
    },
    { label: 'Avg LoS (n)', val: b => ({ text: fmtNum(b.avg_los_nights, 1) }) },
  ];

  return (
    <View style={styles.table}>
      <View style={styles.tr}>
        <Text style={styles.thLeft}> </Text>
        {cols.map(c => (
          <Text key={c.key} style={c.isAll ? styles.thAll : styles.th}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i}>
          {r.section ? (
            <View>
              <Text style={styles.sectionRow}>{r.section}</Text>
            </View>
          ) : null}
          <View style={styles.tr}>
            <Text style={styles.tdLeft}>{r.label}</Text>
            {cols.map(c => {
              const v = r.val(c.bucket);
              return (
                <Text
                  key={c.key}
                  style={[
                    c.isAll ? styles.tdAll : styles.td,
                    v.color ? { color: v.color } : {},
                    v.bold ? { fontFamily: 'Helvetica-Bold' } : {},
                  ]}
                >
                  {v.text}
                </Text>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function PayoutsBlockPdf({ payload }: { payload: DailyReportPayload }) {
  const p = payload.payouts;
  const rows: { label: string; ab: number; st: number; tot: number }[] = [
    {
      label: 'MTD received',
      ab: p.mtd_received_airbnb_usd,
      st: p.mtd_received_stripe_usd,
      tot: p.mtd_received_total_usd,
    },
    {
      label: 'Settling today / tmrw',
      ab: p.expected_today_airbnb_usd,
      st: p.expected_today_stripe_usd,
      tot: p.expected_today_total_usd,
    },
    {
      label: 'Next 7d projected',
      ab: p.next_7d_projected_airbnb_usd,
      st: p.next_7d_projected_stripe_usd,
      tot: p.next_7d_projected_total_usd,
    },
  ];
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>PAYOUTS</Text>
      <View style={styles.payoutsRow}>
        <Text style={styles.tdLeft}> </Text>
        <Text style={[styles.td, { fontFamily: 'Helvetica-Bold' }]}>Airbnb</Text>
        <Text style={[styles.td, { fontFamily: 'Helvetica-Bold' }]}>Stripe</Text>
        <Text style={[styles.td, { fontFamily: 'Helvetica-Bold', color: PALETTE.brand }]}>
          Total
        </Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={styles.payoutsRow}>
          <Text style={styles.tdLeft}>{r.label}</Text>
          <Text style={styles.td}>{fmtUsd(r.ab)}</Text>
          <Text style={styles.td}>{fmtUsd(r.st)}</Text>
          <Text
            style={[
              styles.td,
              { fontFamily: 'Helvetica-Bold', color: PALETTE.brand },
            ]}
          >
            {fmtUsd(r.tot)}
          </Text>
        </View>
      ))}
      <Text style={{ fontSize: 6.5, color: PALETTE.muted, marginTop: 3 }}>
        Airbnb expected = host_payout for reservations checked in yesterday. Stripe expected = arrival_date tomorrow.
      </Text>
    </View>
  );
}

function ReviewsBlockPdf({ payload }: { payload: DailyReportPayload }) {
  const r = payload.reviews;
  return (
    <View style={styles.card}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <Text style={styles.sectionTitle}>REVIEWS · {payload.month_label.toUpperCase()}</Text>
        <Text style={{ fontSize: 7.5, color: PALETTE.ink2 }}>
          {r.count_mtd} reviews · avg {r.avg_rating_mtd.toFixed(1)}*
        </Text>
      </View>
      <View style={styles.starGrid}>
        {r.star_distribution.map(d => (
          <View key={d.stars} style={styles.starCell}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: PALETTE.gold, fontSize: 7 }}>
              {d.stars}*
            </Text>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold' }}>{d.count}</Text>
          </View>
        ))}
      </View>
      {r.last_24h.length > 0 && (
        <View>
          <Text style={{ ...styles.sectionTitle, color: PALETTE.ink2 }}>
            LAST 24H ({r.last_24h.length})
          </Text>
          {r.last_24h.map((rv, i) => (
            <View
              key={i}
              style={[
                styles.reviewItem,
                {
                  borderLeftColor: rv.flagged ? PALETTE.red : PALETTE.line,
                  backgroundColor: rv.flagged ? '#fef2f2' : PALETTE.cardBg,
                },
              ]}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8 }}>
                  {rv.unit} · {rv.channel}
                </Text>
                <Text
                  style={{
                    fontFamily: 'Helvetica-Bold',
                    fontSize: 8,
                    color: rv.flagged ? PALETTE.red : PALETTE.gold,
                  }}
                >
                  {rv.rating ? `${rv.rating}*` : '—'}
                  {rv.flagged ? ' [FLAG]' : ''}
                </Text>
              </View>
              <Text style={{ fontSize: 7.5, color: PALETTE.ink2, marginTop: 1 }}>
                {rv.ai_summary}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ChannelMixPdf({ payload }: { payload: DailyReportPayload }) {
  if (payload.channel_mix.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>CHANNEL MIX (MTD by revenue)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {payload.channel_mix.map(m => (
          <Text key={m.channel} style={{ fontSize: 8, color: PALETTE.ink2 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: PALETTE.ink }}>{m.channel}</Text>: {m.pct.toFixed(1)}% · {fmtUsd(m.revenue_usd)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function MiniBlocksPdf({ payload }: { payload: DailyReportPayload }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
      <View style={[styles.card, { flex: 1, marginTop: 0 }]}>
        <Text style={styles.sectionTitle}>CANCELLATIONS</Text>
        <Text style={{ fontSize: 8 }}>
          Today: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{payload.cancellations.count_today}</Text>
          {payload.cancellations.value_today_usd > 0 && ` · ${fmtUsd(payload.cancellations.value_today_usd)}`}
        </Text>
        <Text style={{ fontSize: 8, color: PALETTE.ink2, marginTop: 1 }}>
          MTD: {payload.cancellations.count_mtd} · {fmtUsd(payload.cancellations.value_mtd_usd)}
        </Text>
      </View>
      <View style={[styles.card, { flex: 1, marginTop: 0 }]}>
        <Text style={styles.sectionTitle}>INQUIRY TRIAGE</Text>
        <Text style={{ fontSize: 8 }}>
          Inquiries unanswered:{' '}
          <Text
            style={{
              fontFamily: 'Helvetica-Bold',
              color:
                payload.inquiry_triage.inquiries_unanswered_count > 0
                  ? PALETTE.amber
                  : PALETTE.ink,
            }}
          >
            {payload.inquiry_triage.inquiries_unanswered_count}
          </Text>
        </Text>
        <Text style={{ fontSize: 8, color: PALETTE.ink2, marginTop: 1 }}>
          In-stay urgent: {payload.inquiry_triage.in_stay_immediate_count} · high:{' '}
          {payload.inquiry_triage.in_stay_high_count}
        </Text>
      </View>
    </View>
  );
}

function CleaningOpsPdf({ payload }: { payload: DailyReportPayload }) {
  if (payload.cleaning_ops_today.length === 0) return null;
  return (
    <View style={styles.cardYellow}>
      <Text style={[styles.sectionTitle, { color: PALETTE.gold }]}>
        CLEANING TURNOVERS TODAY ({payload.cleaning_ops_today.length})
      </Text>
      {payload.cleaning_ops_today.map((c, i) => (
        <Text key={i} style={{ fontSize: 8, marginBottom: 1 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{c.unit}</Text> ({c.building}) · out: {c.checkout_guest} → in: {c.checkin_guest}
        </Text>
      ))}
    </View>
  );
}

function PricingAlertsPdf({ payload }: { payload: DailyReportPayload }) {
  if (payload.pricing_alerts.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>PRICING ALERTS ({payload.pricing_alerts.length})</Text>
      {payload.pricing_alerts.slice(0, 8).map((a, i) => (
        <Text key={i} style={{ fontSize: 8, marginBottom: 1 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{a.unit}</Text> · current {fmtUsd(a.current_price_usd)} vs rec {fmtUsd(a.recommended_price_usd)} ·{' '}
          <Text style={{ color: a.delta_pct < 0 ? PALETTE.red : PALETTE.green }}>
            {a.delta_pct > 0 ? '+' : ''}
            {a.delta_pct.toFixed(1)}%
          </Text>
        </Text>
      ))}
    </View>
  );
}

function DeadInventoryPdf({ payload }: { payload: DailyReportPayload }) {
  if (payload.dead_inventory.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>
        DEAD INVENTORY (0 nights booked next 14 days) — {payload.dead_inventory.length} units
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {payload.dead_inventory.slice(0, 30).map((d, i) => (
          <Text key={i} style={{ fontSize: 7.5, width: '50%', marginBottom: 1 }}>
            • {d.unit} <Text style={{ color: PALETTE.muted }}>({d.building})</Text>
          </Text>
        ))}
      </View>
    </View>
  );
}

function ReportPdfDocument({ payload }: { payload: DailyReportPayload }) {
  const logo = getLogoBytes();
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {logo ? (
              <Image src={logo} style={{ width: 48, height: 48 }} />
            ) : null}
            <View>
              <Text style={styles.title}>Daily Performance Report</Text>
              <Text style={styles.subtitle}>
                {payload.generated_at_cairo} · all amounts USD
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 8, color: PALETTE.muted }}>
            Day {payload.month_days_elapsed} of {payload.month_days_total} · {payload.month_label}
          </Text>
        </View>

        <View style={styles.digestBox}>
          <Text>{payload.digest_oneliner}</Text>
        </View>

        {payload.all.drift_warning && (
          <View
            style={{
              padding: 4,
              backgroundColor: '#fef2f2',
              marginBottom: 6,
            }}
          >
            <Text style={{ fontSize: 7, color: PALETTE.red }}>
              ⚠ {payload.all.drift_warning}
            </Text>
          </View>
        )}

        <BuildingsTablePdf payload={payload} />
        <PayoutsBlockPdf payload={payload} />
        <ChannelMixPdf payload={payload} />
        <MiniBlocksPdf payload={payload} />
        <CleaningOpsPdf payload={payload} />

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Generated ${payload.generated_at_iso} · Beithady InboxOps · Auto-deletes 48h after generation · Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {logo ? (
              <Image src={logo} style={{ width: 36, height: 36 }} />
            ) : null}
            <Text style={styles.title}>Reviews & Watchlist</Text>
          </View>
          <Text style={{ fontSize: 8, color: PALETTE.muted }}>
            {payload.report_date}
          </Text>
        </View>
        <ReviewsBlockPdf payload={payload} />
        <PricingAlertsPdf payload={payload} />
        <DeadInventoryPdf payload={payload} />
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Generated ${payload.generated_at_iso} · Beithady InboxOps · Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

/**
 * Render the full daily report to a PDF Buffer. Throws on render failure
 * so the retry-aware cron can record the error and try again.
 */
export async function renderReportPdf(
  payload: DailyReportPayload
): Promise<Buffer> {
  return await renderToBuffer(<ReportPdfDocument payload={payload} />);
}
