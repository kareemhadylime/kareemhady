// Beithady · Generate Report · A4 PDF render via @react-pdf/renderer.
// Server-side, no Chromium. Mirrors the manual report layout (cover →
// KPI strip → pivot table → charts → commentary). BeitHady brand palette.

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
  Svg,
  Rect,
  Line,
  Circle,
  Path,
  G,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { ReportData, MetricKey, ChartSpec } from './types';
import { METRIC_LABEL, METRIC_UNIT, fmtMetric } from './types';

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
  chartA: '#1e3a5f',
  chartB: '#c9a96e',
  chartC: '#15803d',
  chartD: '#b45309',
  chartE: '#7c3aed',
};

const CHART_COLORS = [
  PALETTE.chartA,
  PALETTE.chartB,
  PALETTE.chartC,
  PALETTE.chartD,
  PALETTE.chartE,
];

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
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: PALETTE.brand,
    marginBottom: 12,
  },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: PALETTE.brand },
  subtitle: { fontSize: 9, color: PALETTE.muted, marginTop: 4 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.brand,
    marginTop: 12,
    marginBottom: 6,
  },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kpiCard: {
    width: '32%',
    padding: 8,
    backgroundColor: PALETTE.cardBg,
    borderWidth: 1,
    borderColor: PALETTE.line,
    borderRadius: 3,
  },
  kpiLabel: { fontSize: 8, color: PALETTE.muted, textTransform: 'uppercase' },
  kpiValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.brand,
    marginTop: 2,
  },
  table: { width: '100%', marginTop: 4 },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: PALETTE.line,
  },
  th: {
    padding: 4,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.brand,
    backgroundColor: PALETTE.brandBg,
    flex: 1,
    textAlign: 'right',
  },
  thFirst: { textAlign: 'left' },
  td: { padding: 4, fontSize: 8, color: PALETTE.ink, flex: 1, textAlign: 'right' },
  tdFirst: {
    textAlign: 'left',
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.ink2,
  },
  bullet: { flexDirection: 'row', marginBottom: 4 },
  bulletDot: { width: 10, color: PALETTE.gold },
  bulletText: { flex: 1, fontSize: 9, lineHeight: 1.4 },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: PALETTE.muted,
  },
});

function shortFmt(value: number | null, key: MetricKey): string {
  if (value == null) return '—';
  const u = METRIC_UNIT[key];
  if (u === 'usd' && Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return fmtMetric(value, u);
}

function GroupedBarSvg({
  data,
  metricKey,
  width = 540,
  height = 220,
}: {
  data: ReportData;
  metricKey: MetricKey;
  width?: number;
  height?: number;
}) {
  const padding = { top: 16, right: 16, bottom: 32, left: 44 };
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;

  const groups = data.rows;
  const periods = data.config.periods;
  if (!groups.length || !periods.length) {
    return (
      <Svg width={width} height={height}>
        <Text>No data</Text>
      </Svg>
    );
  }

  let max = 0;
  for (const r of groups)
    for (const p of periods) {
      const v = r.cells[`${p.id}::${metricKey}`]?.value;
      if (v != null && v > max) max = v;
    }
  if (max === 0) max = 1;

  const groupWidth = w / groups.length;
  const barGap = 2;
  const barWidth = (groupWidth - barGap * (periods.length + 1)) / periods.length;

  return (
    <Svg width={width} height={height}>
      {/* Y-axis grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
        <G key={i}>
          <Line
            x1={padding.left}
            y1={padding.top + h * (1 - f)}
            x2={padding.left + w}
            y2={padding.top + h * (1 - f)}
            stroke={PALETTE.line}
            strokeWidth={0.5}
          />
          <Text
            x={padding.left - 4}
            y={padding.top + h * (1 - f) + 3}
            style={{ fontSize: 7, textAnchor: 'end', fill: PALETTE.muted }}
          >
            {shortFmt(max * f, metricKey)}
          </Text>
        </G>
      ))}
      {/* Bars */}
      {groups.map((row, gi) => (
        <G key={row.groupKey}>
          {periods.map((p, pi) => {
            const v = row.cells[`${p.id}::${metricKey}`]?.value || 0;
            const barH = (v / max) * h;
            const x =
              padding.left +
              gi * groupWidth +
              barGap +
              pi * (barWidth + barGap);
            const y = padding.top + h - barH;
            return (
              <Rect
                key={p.id}
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                fill={CHART_COLORS[pi % CHART_COLORS.length]}
              />
            );
          })}
          <Text
            x={padding.left + gi * groupWidth + groupWidth / 2}
            y={height - 16}
            style={{ fontSize: 7, textAnchor: 'middle', fill: PALETTE.ink2 }}
          >
            {row.groupLabels.primary.slice(0, 14)}
          </Text>
        </G>
      ))}
      {/* Legend */}
      {periods.map((p, pi) => (
        <G key={p.id}>
          <Rect
            x={padding.left + pi * 90}
            y={height - 8}
            width={8}
            height={6}
            fill={CHART_COLORS[pi % CHART_COLORS.length]}
          />
          <Text
            x={padding.left + pi * 90 + 12}
            y={height - 3}
            style={{ fontSize: 7, fill: PALETTE.ink2 }}
          >
            {p.label.slice(0, 18)}
          </Text>
        </G>
      ))}
    </Svg>
  );
}

function BcgQuadrantSvg({
  data,
  spec,
  width = 540,
  height = 320,
}: {
  data: ReportData;
  spec: ChartSpec;
  width?: number;
  height?: number;
}) {
  const padding = { top: 24, right: 16, bottom: 36, left: 50 };
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;
  const occHigh = spec.bcgThresholds?.occHigh ?? 50;
  const revHigh = spec.bcgThresholds?.revHigh ?? 400;

  const period = data.config.periods[0];
  if (!period) return <Svg width={width} height={height} />;

  const points = data.rows
    .map(r => {
      const occ = r.cells[`${period.id}::occupancy_pct`]?.value;
      const rev = r.cells[`${period.id}::avg_revenue_per_month_usd`]?.value;
      const total = r.cells[`${period.id}::total_revenue_usd`]?.value || 0;
      return occ != null && rev != null
        ? { label: r.groupLabels.primary, occ, rev, total }
        : null;
    })
    .filter((p): p is { label: string; occ: number; rev: number; total: number } => !!p);

  if (!points.length) return <Svg width={width} height={height} />;

  const maxOcc = Math.max(100, ...points.map(p => p.occ));
  const maxRev = Math.max(revHigh * 2, ...points.map(p => p.rev));
  const maxTotal = Math.max(...points.map(p => p.total));

  const xOf = (rev: number) => padding.left + (rev / maxRev) * w;
  const yOf = (occ: number) => padding.top + h - (occ / maxOcc) * h;

  return (
    <Svg width={width} height={height}>
      {/* Quadrant guides */}
      <Line
        x1={xOf(revHigh)}
        y1={padding.top}
        x2={xOf(revHigh)}
        y2={padding.top + h}
        stroke={PALETTE.gold}
        strokeWidth={0.7}
        strokeDasharray="3 3"
      />
      <Line
        x1={padding.left}
        y1={yOf(occHigh)}
        x2={padding.left + w}
        y2={yOf(occHigh)}
        stroke={PALETTE.gold}
        strokeWidth={0.7}
        strokeDasharray="3 3"
      />
      {/* Quadrant labels */}
      <Text x={xOf(revHigh) + 6} y={padding.top + 12} style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', fill: PALETTE.green }}>★ STARS</Text>
      <Text x={padding.left + 6} y={padding.top + 12} style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', fill: PALETTE.amber }}>? QUESTION MARKS</Text>
      <Text x={xOf(revHigh) + 6} y={padding.top + h - 6} style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', fill: PALETTE.brand }}>$ CASH COWS</Text>
      <Text x={padding.left + 6} y={padding.top + h - 6} style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', fill: PALETTE.muted }}>DOGS</Text>
      {/* Bubbles */}
      {points.map((pt, i) => {
        const r = 4 + 12 * (pt.total / Math.max(1, maxTotal));
        return (
          <G key={i}>
            <Circle cx={xOf(pt.rev)} cy={yOf(pt.occ)} r={r} fill={PALETTE.brand} fillOpacity={0.6} />
            <Text
              x={xOf(pt.rev)}
              y={yOf(pt.occ) - r - 2}
              style={{ fontSize: 7, textAnchor: 'middle', fill: PALETTE.ink }}
            >
              {pt.label}
            </Text>
          </G>
        );
      })}
      {/* Axes */}
      <Line x1={padding.left} y1={padding.top + h} x2={padding.left + w} y2={padding.top + h} stroke={PALETTE.ink2} strokeWidth={0.5} />
      <Line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + h} stroke={PALETTE.ink2} strokeWidth={0.5} />
      <Text x={padding.left + w / 2} y={height - 6} style={{ fontSize: 8, textAnchor: 'middle', fill: PALETTE.ink2 }}>
        Avg Revenue ($)
      </Text>
      <Text
        x={14}
        y={padding.top + h / 2}
        style={{ fontSize: 8, textAnchor: 'middle', fill: PALETTE.ink2 }}
        transform={`rotate(-90, 14, ${padding.top + h / 2})`}
      >
        Occupancy %
      </Text>
    </Svg>
  );
}

export async function renderReportPdf(data: ReportData): Promise<Buffer> {
  const logo = getLogoBytes();
  const periods = data.config.periods;
  const metrics = data.config.metrics;

  const doc = (
    <Document title={data.config.title} author="Beit Hady">
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.title}>{data.config.title}</Text>
            {data.config.description ? (
              <Text style={styles.subtitle}>{data.config.description}</Text>
            ) : null}
            <Text style={styles.subtitle}>
              {periods.map(p => p.label).join(' · ')}
            </Text>
          </View>
          {logo ? <Image src={logo} style={{ width: 50, height: 50 }} /> : null}
        </View>

        {/* KPI strip — first period totals */}
        {data.config.visualization.showKpiStrip && periods[0] ? (
          <>
            <Text style={styles.sectionTitle}>Key metrics — {periods[0].label}</Text>
            <View style={styles.kpiGrid}>
              {metrics.slice(0, 6).map(m => {
                const cell = data.totals[`${periods[0].id}::${m}`];
                return (
                  <View key={m} style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>{METRIC_LABEL[m]}</Text>
                    <Text style={styles.kpiValue}>{cell?.formatted || '—'}</Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Pivot table */}
        {data.config.visualization.showPivotTable ? (
          <>
            <Text style={styles.sectionTitle}>Detail table</Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <Text style={[styles.th, styles.thFirst]}>Group</Text>
                {periods.flatMap(p =>
                  metrics.map(m => (
                    <Text key={`${p.id}::${m}`} style={styles.th}>
                      {p.label.slice(0, 8)} · {METRIC_LABEL[m].slice(0, 12)}
                    </Text>
                  ))
                )}
              </View>
              {data.rows.slice(0, 28).map(r => (
                <View key={r.groupKey} style={styles.tr} wrap={false}>
                  <Text style={[styles.td, styles.tdFirst]}>
                    {r.groupLabels.secondary
                      ? `${r.groupLabels.primary} · ${r.groupLabels.secondary}`
                      : r.groupLabels.primary}
                  </Text>
                  {periods.flatMap(p =>
                    metrics.map(m => {
                      const c = r.cells[`${p.id}::${m}`];
                      const color =
                        c?.flagged === 'above_target' || c?.flagged === 'anomaly_high'
                          ? PALETTE.green
                          : c?.flagged === 'below_target' || c?.flagged === 'anomaly_low'
                            ? PALETTE.red
                            : PALETTE.ink;
                      return (
                        <Text key={`${p.id}::${m}`} style={[styles.td, { color }]}>
                          {c?.formatted || '—'}
                        </Text>
                      );
                    })
                  )}
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Charts */}
        {data.config.visualization.charts.map(spec => (
          <View key={spec.id} break>
            <Text style={styles.sectionTitle}>
              {spec.title || METRIC_LABEL[spec.metricKey]}
            </Text>
            {spec.type === 'bcg' ? (
              <BcgQuadrantSvg data={data} spec={spec} />
            ) : (
              <GroupedBarSvg data={data} metricKey={spec.metricKey} />
            )}
          </View>
        ))}

        {/* Commentary */}
        {data.commentary?.bullets?.length ? (
          <View break>
            <Text style={styles.sectionTitle}>Conclusions</Text>
            {data.commentary.bullets.map((b, i) => (
              <View key={i} style={styles.bullet}>
                <Text style={styles.bulletDot}>◆</Text>
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
            {data.commentary.action_items?.length ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Action items</Text>
                {data.commentary.action_items.map((a, i) => (
                  <View key={i} style={styles.bullet}>
                    <Text style={styles.bulletDot}>›</Text>
                    <Text style={styles.bulletText}>{a}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Beit Hady · Confidential</Text>
          <Text
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
