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
import { XLABEL_REPORT_THEME } from '../brand-theme';
import type {
  ComparisonChip,
  ComparisonSet,
  KikaDailyPayload,
  TopProductRow,
  InventoryRow,
} from './types';

// A4 PDF render via @react-pdf/renderer. Server-side, no Chromium needed.
// Mirrors the HTML report structure but flattened to PDF primitives.
//
// Two pages:
//   Page 1 — Hero band, anomaly, KPI strip, sparklines (numeric grid),
//            oneliner, top products, inventory health
//   Page 2 — Abandoned, fulfillment, discounts, geography, weekly snapshot,
//            footer

const C = XLABEL_REPORT_THEME;

// Load logos once per cold start. The files live in /public/brand/xlabel/
// and ship with every deployment.
let _xlabelLogo: Buffer | null = null;
let _kikaLogo: Buffer | null = null;
function getXlabelLogo(): Buffer | null {
  if (_xlabelLogo) return _xlabelLogo;
  try {
    _xlabelLogo = readFileSync(
      join(process.cwd(), 'public', 'brand', 'xlabel', 'xlabel-white.png')
    );
    return _xlabelLogo;
  } catch {
    return null;
  }
}
function getKikaLogo(): Buffer | null {
  if (_kikaLogo) return _kikaLogo;
  try {
    _kikaLogo = readFileSync(
      join(process.cwd(), 'public', 'brand', 'xlabel', 'kika-black.png')
    );
    return _kikaLogo;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  page: {
    padding: 0,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: C.ink,
    backgroundColor: C.paper,
  },
  hero: {
    backgroundColor: C.primary,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 10,
  },
  heroEyebrow: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.2,
    fontFamily: 'Helvetica-Bold',
  },
  heroSubtitle: { fontSize: 9, color: 'white', marginTop: 2 },
  heroRight: { textAlign: 'right' },
  heroDay: { fontSize: 8, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  body: { paddingHorizontal: 24, paddingTop: 12 },

  sectionCard: {
    marginTop: 8,
    padding: 8,
    borderWidth: 0.5,
    borderColor: C.rule,
    borderRadius: 3,
    backgroundColor: 'white',
  },
  sectionTitle: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: C.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },

  kpiStrip: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  kpiTile: {
    flex: 1,
    padding: 6,
    borderWidth: 0.5,
    borderColor: C.rule,
    borderRadius: 3,
    backgroundColor: 'white',
  },
  kpiLabel: {
    fontSize: 6.5,
    color: C.muted,
    letterSpacing: 0.8,
    fontFamily: 'Helvetica-Bold',
  },
  kpiValue: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: C.ink,
    marginTop: 2,
  },
  chipRow: { flexDirection: 'row', gap: 4, marginTop: 3, flexWrap: 'wrap' },
  chip: {
    fontSize: 6.5,
    paddingHorizontal: 3,
    paddingVertical: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 2,
  },

  customerStrip: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    fontSize: 8,
  },

  onelinerCard: {
    marginTop: 8,
    padding: 8,
    backgroundColor: C.cream,
    borderLeftWidth: 3,
    borderLeftColor: C.gold,
    borderRadius: 2,
  },
  onelinerEyebrow: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: C.gold,
    letterSpacing: 1,
    marginBottom: 3,
  },
  onelinerText: { fontSize: 9, color: C.ink, lineHeight: 1.45 },
  whyText: {
    fontSize: 8,
    color: C.ink2,
    marginTop: 3,
    lineHeight: 1.4,
  },

  anomalyBanner: {
    marginTop: 8,
    padding: 7,
    borderLeftWidth: 3,
    borderRadius: 2,
  },
  anomalyEyebrow: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    marginBottom: 3,
  },
  anomalyText: { fontSize: 8.5, color: C.ink, marginTop: 1, lineHeight: 1.4 },

  table: { marginTop: 4 },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 0.3,
    borderBottomColor: C.rule,
    paddingVertical: 2,
  },
  thLeft: {
    flex: 3,
    padding: 3,
    fontSize: 7,
    color: C.ink2,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.4,
  },
  th: {
    flex: 1,
    padding: 3,
    fontSize: 7,
    color: C.ink2,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    letterSpacing: 0.4,
  },
  tdLeft: {
    flex: 3,
    padding: 3,
    fontSize: 8,
    color: C.ink,
  },
  td: {
    flex: 1,
    padding: 3,
    fontSize: 8,
    color: C.ink,
    textAlign: 'right',
  },

  weeklyBanner: {
    marginTop: 8,
    padding: 8,
    backgroundColor: C.primary,
    borderRadius: 2,
  },
  weeklyEyebrow: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    marginBottom: 3,
  },
  weeklyText: { fontSize: 9, color: 'white', lineHeight: 1.45 },

  footer: {
    position: 'absolute',
    bottom: 14,
    left: 24,
    right: 24,
    paddingTop: 4,
    borderTopWidth: 0.3,
    borderTopColor: C.rule,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6.5,
    color: C.muted,
  },
});

const fmtEgp = (n: number): string => {
  if (n == null || !Number.isFinite(n)) return 'EGP 0';
  if (Math.abs(n) >= 1_000_000) return `EGP ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `EGP ${Math.round(n).toLocaleString('en-US')}`;
  return 'EGP ' + Math.round(n).toLocaleString('en-US');
};
const fmtEgp1 = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return `EGP ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `EGP ${Math.round(n / 1000)}k`;
  return fmtEgp(n);
};
const fmtPct = (n: number | null, dp = 1): string =>
  n === null ? '—' : n.toFixed(dp) + '%';

function chipColor(chip: ComparisonChip | null): string {
  if (!chip) return C.flat;
  if (chip.direction === 'up') return C.upGreen;
  if (chip.direction === 'down') return C.downRed;
  return C.flat;
}
function chipText(chip: ComparisonChip | null): string {
  if (!chip) return '— flat';
  if (chip.pct === null) return chip.direction === 'up' ? '▲ new' : chip.direction === 'down' ? '▼ to 0' : '— flat';
  const sign = chip.pct > 0 ? '+' : '';
  const arrow = chip.direction === 'up' ? '▲' : chip.direction === 'down' ? '▼' : '—';
  return `${arrow} ${sign}${chip.pct.toFixed(1)}%`;
}

function ChipsRowPdf({ comp }: { comp: ComparisonSet }) {
  const chips: Array<{ label: string; chip: ComparisonChip | null }> = [
    { label: 'd', chip: comp.vs_prior_day },
    { label: 'w', chip: comp.vs_prior_weekday },
    { label: 'm', chip: comp.vs_mtd_prior_month },
  ];
  if (comp.vs_prior_year) chips.push({ label: 'y', chip: comp.vs_prior_year });
  return (
    <View style={styles.chipRow}>
      {chips.map((c, i) => (
        <Text key={i} style={[styles.chip, { color: chipColor(c.chip) }]}>
          {chipText(c.chip)}{' '}
          <Text style={{ color: C.muted }}>{c.label}</Text>
        </Text>
      ))}
    </View>
  );
}

function HeroBandPdf({ payload }: { payload: KikaDailyPayload }) {
  const xlabel = getXlabelLogo();
  return (
    <View style={styles.hero}>
      <View style={styles.heroLeft}>
        {xlabel ? (
          <Image
            src={xlabel}
            style={{ height: 24, width: 80, objectFit: 'contain' }}
          />
        ) : (
          <Text style={{ color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 12 }}>
            X-Label
          </Text>
        )}
        <View style={styles.heroDivider} />
        <View>
          <Text style={styles.heroEyebrow}>DAILY PERFORMANCE · KIKA</Text>
          <Text style={styles.heroSubtitle}>{payload.generated_at_cairo}</Text>
        </View>
      </View>
      <View style={styles.heroRight}>
        <Text
          style={{
            fontSize: 7,
            color: 'rgba(255,255,255,0.6)',
            letterSpacing: 0.5,
          }}
        >
          {payload.month_label.toUpperCase()}
        </Text>
        <Text style={styles.heroDay}>{payload.weekday_label}</Text>
      </View>
    </View>
  );
}

function AnomalyBannerPdf({ payload }: { payload: KikaDailyPayload }) {
  if (payload.anomalies.length === 0) return null;
  const order = { critical: 0, warn: 1, info: 2 };
  const sorted = [...payload.anomalies].sort(
    (a, b) => order[a.severity] - order[b.severity]
  );
  const top = sorted[0];
  const colorBg =
    top.severity === 'critical'
      ? '#fef2f2'
      : top.severity === 'warn'
        ? '#fffbeb'
        : C.cream;
  const colorBar =
    top.severity === 'critical'
      ? C.downRed
      : top.severity === 'warn'
        ? C.amber
        : C.gold;
  return (
    <View
      style={[
        styles.anomalyBanner,
        { backgroundColor: colorBg, borderLeftColor: colorBar },
      ]}
    >
      <Text style={[styles.anomalyEyebrow, { color: colorBar }]}>
        {sorted.length} SIGNAL{sorted.length === 1 ? '' : 'S'} DETECTED
      </Text>
      {sorted.map((a, i) => (
        <Text key={i} style={styles.anomalyText}>
          {a.message}
        </Text>
      ))}
    </View>
  );
}

function KpiStripPdf({ payload }: { payload: KikaDailyPayload }) {
  const t = payload.topline;
  const tiles: Array<{ label: string; value: string; comp: ComparisonSet }> = [
    {
      label: 'NET REVENUE',
      value: fmtEgp(t.net_revenue_egp),
      comp: t.comparisons.net_revenue,
    },
    {
      label: 'ORDERS',
      value: String(t.orders),
      comp: t.comparisons.orders,
    },
    {
      label: 'AOV',
      value: t.aov_egp !== null ? fmtEgp(t.aov_egp) : '—',
      comp: t.comparisons.aov,
    },
    {
      label: 'UNITS',
      value: String(t.units),
      comp: t.comparisons.units,
    },
  ];
  return (
    <View style={styles.kpiStrip}>
      {tiles.map((tile, i) => (
        <View key={i} style={styles.kpiTile}>
          <Text style={styles.kpiLabel}>{tile.label}</Text>
          <Text style={styles.kpiValue}>{tile.value}</Text>
          <ChipsRowPdf comp={tile.comp} />
        </View>
      ))}
    </View>
  );
}

function CustomerStripPdf({ payload }: { payload: KikaDailyPayload }) {
  const t = payload.topline;
  return (
    <View style={styles.customerStrip}>
      <Text>
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>{t.unique_customers}</Text> customers
      </Text>
      <Text>
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>{t.new_customers}</Text> new ·{' '}
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>{t.returning_customers}</Text> returning
      </Text>
      {t.repeat_rate_pct !== null && (
        <Text>
          repeat{' '}
          <Text style={{ color: C.kikaPink, fontFamily: 'Helvetica-Bold' }}>
            {fmtPct(t.repeat_rate_pct)}
          </Text>
        </Text>
      )}
      <Text style={{ color: C.muted }}>
        Discounts {fmtEgp1(t.discounts_egp)} · Refunds {fmtEgp1(t.refunds_egp)}
      </Text>
    </View>
  );
}

function OnelinerCardPdf({ payload }: { payload: KikaDailyPayload }) {
  return (
    <View style={styles.onelinerCard}>
      <Text style={styles.onelinerEyebrow}>AT A GLANCE</Text>
      <Text style={styles.onelinerText}>{payload.digest_oneliner}</Text>
      {payload.why.map((w, i) => (
        <Text key={i} style={styles.whyText}>
          → {w.text}
        </Text>
      ))}
    </View>
  );
}

function TopProductsPdf({ products }: { products: TopProductRow[] }) {
  if (products.length === 0) return null;
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>TOP PRODUCTS · YESTERDAY</Text>
      <View style={styles.tr}>
        <Text style={[styles.thLeft, { textAlign: 'left' }]}>Product</Text>
        <Text style={styles.th}>Units</Text>
        <Text style={styles.th}>Revenue</Text>
        <Text style={styles.th}>Share</Text>
      </View>
      {products.slice(0, 8).map((p, i) => (
        <View key={i} style={styles.tr}>
          <Text style={styles.tdLeft}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{p.title}</Text>
            {p.variant_label ? (
              <Text style={{ color: C.muted }}> · {p.variant_label}</Text>
            ) : null}
          </Text>
          <Text style={styles.td}>{p.units}</Text>
          <Text style={styles.td}>{fmtEgp1(p.revenue_egp)}</Text>
          <Text
            style={[
              styles.td,
              {
                color: p.share_of_day_pct >= 30 ? C.kikaPink : C.muted,
                fontFamily:
                  p.share_of_day_pct >= 30 ? 'Helvetica-Bold' : 'Helvetica',
              },
            ]}
          >
            {p.share_of_day_pct.toFixed(1)}%
          </Text>
        </View>
      ))}
    </View>
  );
}

function InventorySectionPdf({ payload }: { payload: KikaDailyPayload }) {
  const inv = payload.inventory;
  if (
    inv.stockouts.length === 0 &&
    inv.low.length === 0 &&
    inv.overstock.length === 0
  ) {
    return null;
  }
  const Bucket = ({
    title,
    rows,
    color,
  }: {
    title: string;
    rows: InventoryRow[];
    color: string;
  }) => {
    if (rows.length === 0) return null;
    return (
      <View style={{ marginTop: 4 }}>
        <Text
          style={{
            fontSize: 7,
            fontFamily: 'Helvetica-Bold',
            color,
            letterSpacing: 0.5,
            marginBottom: 2,
          }}
        >
          {title.toUpperCase()} ({rows.length})
        </Text>
        {rows.slice(0, 8).map((r, i) => (
          <Text key={i} style={{ fontSize: 7.5, marginBottom: 1 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{r.title}</Text>
            {r.variant_label ? ` · ${r.variant_label}` : ''}
            <Text style={{ color: C.muted }}>
              {r.status === 'stockout'
                ? `  (0 left, was ${r.daily_velocity}/d)`
                : r.days_of_cover !== null
                  ? `  (${r.on_hand} left · ~${r.days_of_cover}d)`
                  : `  (${r.on_hand} left)`}
            </Text>
          </Text>
        ))}
      </View>
    );
  };
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>
        INVENTORY HEALTH · {inv.total_skus_tracked} SKUs
      </Text>
      <Bucket title="Sold out" rows={inv.stockouts} color={C.downRed} />
      <Bucket title="Low stock <14d" rows={inv.low} color={C.amber} />
      <Bucket title="Overstock >120d" rows={inv.overstock} color={C.muted} />
    </View>
  );
}

function AbandonedPdf({ payload }: { payload: KikaDailyPayload }) {
  const a = payload.abandoned;
  if (a.count === 0) return null;
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>ABANDONED CHECKOUTS</Text>
      <Text style={{ fontSize: 8, marginBottom: 4 }}>
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>{a.count}</Text> carts ·{' '}
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>
          {fmtEgp1(a.recoverable_egp)}
        </Text>{' '}
        recoverable
        {a.avg_cart_egp !== null && ` · avg ${fmtEgp1(a.avg_cart_egp)}`}
        {a.recovery_rate_pct !== null && ` · ${fmtPct(a.recovery_rate_pct)} recovery`}
        <Text style={{ color: C.muted }}>
          {' '}· {a.with_email_count} emailable ({fmtPct(a.with_email_pct, 0)})
        </Text>
      </Text>
      {a.top_5.length > 0 && (
        <>
          <Text
            style={{
              fontSize: 6.5,
              fontFamily: 'Helvetica-Bold',
              color: C.muted,
              marginTop: 3,
            }}
          >
            TOP 5 BY VALUE
          </Text>
          {a.top_5.map((row, i) => (
            <Text key={i} style={{ fontSize: 7.5, marginBottom: 1 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                {fmtEgp1(row.total_egp)}
              </Text>
              {' · '}
              {row.customer_name || row.email || 'guest'}
              {row.line_items > 0 ? ` · ${row.line_items} items` : ''}
              {row.age_hours !== null ? ` · ${row.age_hours}h` : ''}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

function FulfillmentPdf({ payload }: { payload: KikaDailyPayload }) {
  const f = payload.fulfillment;
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>FULFILLMENT</Text>
      <Text style={{ fontSize: 8, marginBottom: 4 }}>
        <Text
          style={{
            fontFamily: 'Helvetica-Bold',
            color:
              f.shipped_within_24h_pct === null
                ? C.muted
                : f.shipped_within_24h_pct >= 80
                  ? C.upGreen
                  : f.shipped_within_24h_pct >= 60
                    ? C.amber
                    : C.downRed,
          }}
        >
          {fmtPct(f.shipped_within_24h_pct)}
        </Text>{' '}
        shipped &lt;24h ·{' '}
        <Text style={{ color: C.muted }}>
          {f.fulfilled_count} fulfilled · {f.unfulfilled_count} unfulfilled
        </Text>
        {' · '}
        <Text
          style={{
            color: f.delayed_over_48h_count > 0 ? C.downRed : C.muted,
          }}
        >
          {f.delayed_over_48h_count} &gt;48h
        </Text>
        {f.avg_hours_to_fulfill !== null && (
          <Text style={{ color: C.muted }}>
            {' · avg '}
            {f.avg_hours_to_fulfill}h · median {f.median_hours_to_fulfill}h
          </Text>
        )}
      </Text>
      {f.oldest_unfulfilled.length > 0 && (
        <>
          <Text
            style={{
              fontSize: 6.5,
              fontFamily: 'Helvetica-Bold',
              color: C.muted,
            }}
          >
            OLDEST UNFULFILLED
          </Text>
          {f.oldest_unfulfilled.map((o, i) => (
            <Text key={i} style={{ fontSize: 7.5, marginBottom: 1 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{o.name}</Text> ·{' '}
              {o.customer_name || '—'}
              {o.age_hours !== null ? ` · ${o.age_hours}h` : ''}
              {o.total_egp !== null ? ` · ${fmtEgp1(o.total_egp)}` : ''}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

function DiscountsPdf({ payload }: { payload: KikaDailyPayload }) {
  const d = payload.discounts;
  if (d.total_orders_with_discount === 0 && d.total_discount_egp === 0) {
    return null;
  }
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>DISCOUNTS &amp; PROMOTIONS</Text>
      <Text style={{ fontSize: 8, marginBottom: 4 }}>
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>
          {d.total_orders_with_discount}
        </Text>{' '}
        orders · -<Text style={{ fontFamily: 'Helvetica-Bold' }}>
          {fmtEgp1(d.total_discount_egp)}
        </Text>
        {d.pct_of_gross_revenue !== null && (
          <Text
            style={{
              color:
                d.pct_of_gross_revenue >= 20
                  ? C.amber
                  : d.pct_of_gross_revenue >= 10
                    ? C.muted
                    : C.upGreen,
            }}
          >
            {' · '}
            {fmtPct(d.pct_of_gross_revenue, 1)} of gross
          </Text>
        )}
      </Text>
      {d.by_code.length > 0 && (
        <Text style={{ fontSize: 7.5 }}>
          {d.by_code.slice(0, 6).map((c, i) => (
            <Text key={i}>
              {i > 0 && '   '}
              <Text style={{ color: C.kikaPink, fontFamily: 'Helvetica-Bold' }}>
                {c.code}
              </Text>
              ×{c.uses} -{fmtEgp1(c.discount_egp)}
            </Text>
          ))}
        </Text>
      )}
    </View>
  );
}

function GeographyPdf({ payload }: { payload: KikaDailyPayload }) {
  const g = payload.geo;
  if (g.by_country.length === 0) return null;
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>GEOGRAPHY · YESTERDAY</Text>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 6.5,
              fontFamily: 'Helvetica-Bold',
              color: C.muted,
              marginBottom: 2,
            }}
          >
            COUNTRIES
          </Text>
          {g.by_country.map((c, i) => (
            <Text key={i} style={{ fontSize: 7.5, marginBottom: 1 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{c.label}</Text> ·{' '}
              {c.orders} ord · {fmtEgp1(c.revenue_egp)}{' '}
              <Text style={{ color: C.muted }}>
                ({c.pct_of_revenue.toFixed(0)}%)
              </Text>
            </Text>
          ))}
        </View>
        {g.by_governorate.length > 0 && (
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 6.5,
                fontFamily: 'Helvetica-Bold',
                color: C.muted,
                marginBottom: 2,
              }}
            >
              EGYPT · GOVERNORATES
            </Text>
            {g.by_governorate.map((c, i) => (
              <Text key={i} style={{ fontSize: 7.5, marginBottom: 1 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{c.label}</Text> ·{' '}
                {c.orders} ord · {fmtEgp1(c.revenue_egp)}{' '}
                <Text style={{ color: C.muted }}>
                  ({c.pct_of_revenue.toFixed(0)}%)
                </Text>
              </Text>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function WeeklyBannerPdf({ payload }: { payload: KikaDailyPayload }) {
  if (!payload.weekly_digest) return null;
  return (
    <View style={styles.weeklyBanner}>
      <Text style={styles.weeklyEyebrow}>WEEKLY SNAPSHOT</Text>
      <Text style={styles.weeklyText}>{payload.weekly_digest.oneliner}</Text>
    </View>
  );
}

function FooterPdf({ payload }: { payload: KikaDailyPayload }) {
  const kika = getKikaLogo();
  return (
    <View style={styles.footer} fixed>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {kika ? (
          <Image
            src={kika}
            style={{ height: 8, width: 30, objectFit: 'contain', marginRight: 4 }}
          />
        ) : null}
        <Text>KIKA · X-Label · all amounts EGP · auto-deletes 48h</Text>
      </View>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Generated ${payload.generated_at_iso.slice(0, 19)} · Page ${pageNumber}/${totalPages}`
        }
      />
    </View>
  );
}

function ReportPdfDocument({ payload }: { payload: KikaDailyPayload }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <HeroBandPdf payload={payload} />
        <View style={styles.body}>
          <AnomalyBannerPdf payload={payload} />
          <KpiStripPdf payload={payload} />
          <CustomerStripPdf payload={payload} />
          <OnelinerCardPdf payload={payload} />
          <TopProductsPdf products={payload.top_products} />
          <InventorySectionPdf payload={payload} />
        </View>
        <FooterPdf payload={payload} />
      </Page>
      <Page size="A4" style={styles.page}>
        <HeroBandPdf payload={payload} />
        <View style={styles.body}>
          <AbandonedPdf payload={payload} />
          <FulfillmentPdf payload={payload} />
          <DiscountsPdf payload={payload} />
          <GeographyPdf payload={payload} />
          <WeeklyBannerPdf payload={payload} />
        </View>
        <FooterPdf payload={payload} />
      </Page>
    </Document>
  );
}

/**
 * Render the KIKA daily report to a PDF Buffer. Throws on render failure
 * so the cron's retry-aware orchestrator can record the error and try
 * again on the next tick.
 */
export async function renderKikaReportPdf(
  payload: KikaDailyPayload
): Promise<Buffer> {
  return await renderToBuffer(<ReportPdfDocument payload={payload} />);
}
