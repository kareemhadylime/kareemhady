'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  Cell,
} from 'recharts';
import type {
  ReportData,
  MetricKey,
  ChartSpec,
  ChannelBucket,
} from '@/lib/beithady/reports/types';
import { METRIC_LABEL, METRIC_UNIT, fmtMetric } from '@/lib/beithady/reports/types';
import { CHANNEL_LABEL, CHANNEL_COLOR } from '@/lib/beithady/reports/channel-taxonomy';

const PALETTE = ['var(--bh-ink)', '#c9a96e', '#15803d', '#b45309', '#7c3aed'];

// =============================================================================
// KPI Strip â€” top row of metric cards with sparkline
// =============================================================================
export function KpiStrip({ data }: { data: ReportData }) {
  const period = data.config.periods[0];
  if (!period) return null;
  const metrics = data.config.metrics.slice(0, 6);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {metrics.map(m => {
        const cell = data.totals[`${period.id}::${m}`];
        // Compute period-over-period delta if 2+ periods exist
        let delta: number | null = null;
        if (data.config.periods.length > 1) {
          const prev = data.totals[`${data.config.periods[1].id}::${m}`];
          if (prev?.value != null && cell?.value != null && prev.value !== 0) {
            delta = ((cell.value - prev.value) / Math.abs(prev.value)) * 100;
          }
        }
        return (
          <div
            key={m}
            className="ix-card p-3 flex flex-col gap-1"
            style={{ borderLeft: '3px solid #c9a96e' }}
          >
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {METRIC_LABEL[m]}
            </div>
            <div className="text-xl font-bold text-[var(--bh-ink)] dark:text-amber-100 tabular-nums">
              {cell?.formatted || 'â€”'}
            </div>
            {delta != null ? (
              <div
                className={`text-[10px] font-semibold ${
                  delta >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {delta >= 0 ? 'â–²' : 'â–¼'} {Math.abs(delta).toFixed(1)}% vs prior
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Pivot Table â€” replicates the manual sheet exactly
// =============================================================================
export function PivotTable({ data }: { data: ReportData }) {
  const periods = data.config.periods;
  const metrics = data.config.metrics;

  return (
    <div className="ix-card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#f0e9d9] text-[var(--bh-ink)]">
            <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-[#f0e9d9]">
              Group
            </th>
            {periods.map(p => (
              <th
                key={p.id}
                colSpan={metrics.length}
                className="px-3 py-2 text-center font-semibold border-l border-amber-200"
              >
                {p.label}
              </th>
            ))}
          </tr>
          <tr className="bg-[#faf8f3] text-slate-700">
            <th className="px-3 py-1.5 sticky left-0 bg-[#faf8f3]"></th>
            {periods.flatMap(p =>
              metrics.map(m => (
                <th
                  key={`${p.id}::${m}`}
                  className="px-2 py-1.5 text-right font-medium text-[10px]"
                >
                  {METRIC_LABEL[m]}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {data.rows.map(r => (
            <tr key={r.groupKey} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-1.5 font-medium sticky left-0 bg-white dark:bg-slate-900">
                {r.groupLabels.secondary
                  ? `${r.groupLabels.primary} Â· ${r.groupLabels.secondary}`
                  : r.groupLabels.primary}
              </td>
              {periods.flatMap(p =>
                metrics.map(m => {
                  const c = r.cells[`${p.id}::${m}`];
                  const cls =
                    c?.flagged === 'above_target' || c?.flagged === 'anomaly_high'
                      ? 'text-emerald-700 font-semibold'
                      : c?.flagged === 'below_target' || c?.flagged === 'anomaly_low'
                        ? 'text-rose-700 font-semibold'
                        : 'text-slate-800 dark:text-slate-200';
                  return (
                    <td
                      key={`${p.id}::${m}`}
                      className={`px-2 py-1.5 text-right tabular-nums ${cls}`}
                      title={c?.flagged || undefined}
                    >
                      {c?.formatted || 'â€”'}
                    </td>
                  );
                })
              )}
            </tr>
          ))}
          <tr className="border-t-2 border-amber-300 bg-[#faf8f3] font-bold">
            <td className="px-3 py-2 sticky left-0 bg-[#faf8f3]">TOTAL / AVG</td>
            {periods.flatMap(p =>
              metrics.map(m => {
                const c = data.totals[`${p.id}::${m}`];
                return (
                  <td key={`${p.id}::${m}`} className="px-2 py-2 text-right tabular-nums">
                    {c?.formatted || 'â€”'}
                  </td>
                );
              })
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// ChartsPanel â€” renders all charts from config.visualization.charts
// =============================================================================
export function ChartsPanel({ data }: { data: ReportData }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {data.config.visualization.charts.map(spec => (
        <div key={spec.id} className="ix-card p-4">
          <h3 className="text-sm font-semibold text-[var(--bh-ink)] dark:text-amber-100 mb-3">
            {spec.title || METRIC_LABEL[spec.metricKey]}
          </h3>
          <ChartRenderer data={data} spec={spec} />
        </div>
      ))}
    </div>
  );
}

function ChartRenderer({ data, spec }: { data: ReportData; spec: ChartSpec }) {
  switch (spec.type) {
    case 'time_series':
      return <TimeSeriesChart data={data} spec={spec} />;
    case 'grouped_bar':
      return <GroupedBarChart data={data} spec={spec} />;
    case 'stacked_bar':
      return <StackedBarChart data={data} spec={spec} />;
    case 'bcg':
      return <BcgQuadrantChart data={data} spec={spec} />;
    case 'heatmap':
      return <HeatmapChart data={data} spec={spec} />;
    default:
      return null;
  }
}

// =============================================================================
// Grouped Bar â€” group on X, periods as bars side-by-side
// =============================================================================
function GroupedBarChart({ data, spec }: { data: ReportData; spec: ChartSpec }) {
  const chartData = data.rows.map(r => {
    const row: Record<string, string | number> = {
      group: r.groupLabels.secondary
        ? `${r.groupLabels.primary} Â· ${r.groupLabels.secondary}`
        : r.groupLabels.primary,
    };
    for (const p of data.config.periods) {
      const v = r.cells[`${p.id}::${spec.metricKey}`]?.value;
      row[p.label] = v ?? 0;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e6dfce" />
        <XAxis
          dataKey="group"
          tick={{ fontSize: 10 }}
          interval={0}
          angle={-30}
          textAnchor="end"
        />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtMetric(v as number, METRIC_UNIT[spec.metricKey])} />
        <Tooltip
          formatter={(v: number) => fmtMetric(v, METRIC_UNIT[spec.metricKey])}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {data.config.periods.map((p, i) => (
          <Bar key={p.id} dataKey={p.label} fill={PALETTE[i % PALETTE.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// =============================================================================
// Stacked Bar â€” group on X, channel split as stacked bars
// =============================================================================
function StackedBarChart({ data, spec }: { data: ReportData; spec: ChartSpec }) {
  const period = data.config.periods[0];
  if (!period) return <div className="text-xs text-slate-500">No period</div>;

  const chartData = data.rows.map(r => {
    const split = r.channelSplit?.[period.id];
    const row: Record<string, string | number> = {
      group: r.groupLabels.primary,
    };
    if (split) {
      for (const ch of ['airbnb', 'booking_com', 'other_ota', 'manual'] as ChannelBucket[]) {
        row[CHANNEL_LABEL[ch]] = split[ch] || 0;
      }
    } else {
      // Fallback: use the metric value directly
      const v = r.cells[`${period.id}::${spec.metricKey}`]?.value || 0;
      row.value = v;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e6dfce" />
        <XAxis dataKey="group" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {(['airbnb', 'booking_com', 'other_ota', 'manual'] as ChannelBucket[]).map(ch => (
          <Bar
            key={ch}
            dataKey={CHANNEL_LABEL[ch]}
            stackId="a"
            fill={CHANNEL_COLOR[ch]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// =============================================================================
// Time series â€” periods on X (or weeks if multi-month range), groups as lines
// =============================================================================
function TimeSeriesChart({ data, spec }: { data: ReportData; spec: ChartSpec }) {
  const chartData = data.config.periods.map(p => {
    const row: Record<string, string | number> = { period: p.label };
    for (const r of data.rows) {
      const v = r.cells[`${p.id}::${spec.metricKey}`]?.value;
      row[r.groupLabels.primary] = v ?? 0;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e6dfce" />
        <XAxis dataKey="period" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtMetric(v as number, METRIC_UNIT[spec.metricKey])} />
        <Tooltip
          formatter={(v: number) => fmtMetric(v, METRIC_UNIT[spec.metricKey])}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {data.rows.slice(0, 8).map((r, i) => (
          <Line
            key={r.groupKey}
            type="monotone"
            dataKey={r.groupLabels.primary}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// =============================================================================
// BCG Quadrant â€” Avg Revenue Ã— Occupancy, bubble size = Total Revenue
// =============================================================================
function BcgQuadrantChart({ data, spec }: { data: ReportData; spec: ChartSpec }) {
  const period = data.config.periods[0];
  if (!period) return <div className="text-xs text-slate-500">No period</div>;
  const occHigh = spec.bcgThresholds?.occHigh ?? 50;
  const revHigh = spec.bcgThresholds?.revHigh ?? 400;

  const points = data.rows
    .map(r => {
      const occ = r.cells[`${period.id}::occupancy_pct`]?.value;
      const rev = r.cells[`${period.id}::avg_revenue_per_month_usd`]?.value;
      const total = r.cells[`${period.id}::total_revenue_usd`]?.value || 0;
      return occ != null && rev != null
        ? { name: r.groupLabels.primary, occ, rev, total: Math.max(50, total / 10) }
        : null;
    })
    .filter((p): p is { name: string; occ: number; rev: number; total: number } => !!p);

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ScatterChart margin={{ top: 16, right: 16, bottom: 24, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e6dfce" />
        <XAxis
          type="number"
          dataKey="rev"
          name="Avg Revenue"
          tick={{ fontSize: 10 }}
          label={{ value: 'Avg Revenue ($)', position: 'insideBottom', fontSize: 10, offset: -10 }}
        />
        <YAxis
          type="number"
          dataKey="occ"
          name="Occupancy %"
          domain={[0, 100]}
          tick={{ fontSize: 10 }}
          label={{ value: 'Occupancy %', angle: -90, position: 'insideLeft', fontSize: 10 }}
        />
        <ZAxis type="number" dataKey="total" range={[60, 400]} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          formatter={(v: number, name: string) => [
            name === 'occ' ? `${v.toFixed(1)}%` : `$${Math.round(v).toLocaleString()}`,
            name === 'occ' ? 'Occupancy' : name === 'rev' ? 'Avg Revenue' : 'Total Rev',
          ]}
          contentStyle={{ fontSize: 12 }}
        />
        <ReferenceLine x={revHigh} stroke="#c9a96e" strokeDasharray="3 3" />
        <ReferenceLine y={occHigh} stroke="#c9a96e" strokeDasharray="3 3" />
        <Scatter data={points} fill="var(--bh-ink)">
          {points.map((p, i) => {
            const isStar = p.occ >= occHigh && p.rev >= revHigh;
            const isCash = p.occ < occHigh && p.rev >= revHigh;
            const isQ = p.occ >= occHigh && p.rev < revHigh;
            const color = isStar ? '#15803d' : isCash ? 'var(--bh-ink)' : isQ ? '#b45309' : '#7a8aa3';
            return <Cell key={i} fill={color} />;
          })}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// =============================================================================
// Heatmap â€” group Ã— period, color = metric value
// =============================================================================
function HeatmapChart({ data, spec }: { data: ReportData; spec: ChartSpec }) {
  const periods = data.config.periods;
  const groups = data.rows;

  // Find max for color scale
  let max = 0;
  for (const r of groups)
    for (const p of periods) {
      const v = r.cells[`${p.id}::${spec.metricKey}`]?.value;
      if (v != null && v > max) max = v;
    }
  if (max === 0) max = 1;

  function colorFor(v: number | null): string {
    if (v == null) return '#f3f4f6';
    const t = Math.min(1, Math.max(0, v / max));
    if (t < 0.25) return '#dcfce7';
    if (t < 0.5) return '#bbf7d0';
    if (t < 0.75) return '#86efac';
    if (t < 0.9) return '#22c55e';
    return '#15803d';
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-semibold text-slate-700"></th>
            {periods.map(p => (
              <th key={p.id} className="px-2 py-1 text-center font-semibold text-slate-700">
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map(r => (
            <tr key={r.groupKey}>
              <td className="px-2 py-1 font-medium text-slate-700">
                {r.groupLabels.primary}
              </td>
              {periods.map(p => {
                const c = r.cells[`${p.id}::${spec.metricKey}`];
                return (
                  <td
                    key={p.id}
                    style={{
                      background: colorFor(c?.value || null),
                      color: 'var(--bh-ink)',
                    }}
                    className="px-2 py-1 text-center font-semibold tabular-nums"
                  >
                    {c?.formatted || 'â€”'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
