'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings2,
  GitCompare,
  LineChart as LineChartIcon,
  Sparkles,
  Download,
  Save,
  Play,
  FileText,
  Plus,
  X,
} from 'lucide-react';
import type {
  ReportConfig,
  ReportData,
  GroupAxis,
  MetricKey,
  BedroomBucket,
  BuildingCode,
  ChannelBucket,
  ChartType,
  ChartSpec,
  ComparisonMode,
} from '@/lib/beithady/reports/types';
import { METRIC_LABEL } from '@/lib/beithady/reports/types';
import { ChartsPanel, KpiStrip, PivotTable } from './charts/index';

const ALL_METRICS: MetricKey[] = [
  'occupancy_pct',
  'market_occupancy_pct',
  'occ_vs_market_pp',
  'total_revenue_usd',
  'avg_revenue_per_month_usd',
  'revpar_usd',
  'revenue_share_pct',
  'adr_usd',
  'reservations_count',
  'avg_lead_time_days',
  'avg_los_nights',
  'avg_overall_rating',
  'total_reviews',
];

const ALL_BUILDINGS: BuildingCode[] = ['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'OTHER'];
const ALL_BEDROOMS: BedroomBucket[] = ['studio', '1', '2', '3', '4_plus'];
const ALL_CHANNELS: ChannelBucket[] = ['airbnb', 'booking_com', 'other_ota', 'manual'];
const GROUP_LABELS: Record<GroupAxis, string> = {
  building: 'Building',
  bedroom: 'Bedroom',
  listing: 'Listing',
  channel: 'Channel',
  listing_type: 'Listing type',
  building_x_bedroom: 'Building × Bedroom',
};

type Tab = 'setup' | 'compare' | 'visualize' | 'commentary' | 'export';

export function ReportBuilder({
  initialConfig,
  canSave,
}: {
  initialConfig: ReportConfig;
  canSave: boolean;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<ReportConfig>(initialConfig);
  const [tab, setTab] = useState<Tab>('setup');
  const [data, setData] = useState<ReportData | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savePending, startSave] = useTransition();

  // Auto-run preview on mount + on config change (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      runReport();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(config)]);

  async function runReport() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/beithady/reports/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config, commentary: false }),
      });
      const json = (await res.json()) as { data?: ReportData; error?: string };
      if (json.error) throw new Error(json.error);
      setData(json.data || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  function saveReport() {
    if (!canSave) return;
    startSave(async () => {
      const res = await fetch('/api/beithady/reports/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          config,
          last_run_data: data,
          commentary: data?.commentary,
        }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (json.id) router.push(`/beithady/analytics/reports/${json.id}`);
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: tabs + config controls */}
      <aside className="lg:col-span-4 space-y-4">
        <div className="ix-card p-3">
          <div className="flex items-center gap-1 text-xs">
            {(
              [
                { k: 'setup', i: Settings2, l: 'Setup' },
                { k: 'compare', i: GitCompare, l: 'Compare' },
                { k: 'visualize', i: LineChartIcon, l: 'Visualize' },
                { k: 'commentary', i: Sparkles, l: 'AI' },
                { k: 'export', i: Download, l: 'Export' },
              ] as Array<{ k: Tab; i: typeof Settings2; l: string }>
            ).map(t => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded transition ${
                  tab === t.k
                    ? 'bg-[var(--bh-ink)] text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <t.i size={14} />
                <span className="hidden sm:inline">{t.l}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ix-card p-4 space-y-4">
          {tab === 'setup' && <SetupTab config={config} setConfig={setConfig} />}
          {tab === 'compare' && <CompareTab config={config} setConfig={setConfig} />}
          {tab === 'visualize' && <VisualizeTab config={config} setConfig={setConfig} />}
          {tab === 'commentary' && <CommentaryTab config={config} setConfig={setConfig} data={data} />}
          {tab === 'export' && (
            <ExportTab
              config={config}
              data={data}
              canSave={canSave}
              onSave={saveReport}
              savePending={savePending}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runReport}
            disabled={running}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--bh-ink)] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2c4d7a] disabled:opacity-50"
          >
            <Play size={14} />
            {running ? 'Running…' : 'Run preview'}
          </button>
          {canSave ? (
            <button
              onClick={saveReport}
              disabled={savePending || !data}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <Save size={14} />
              {savePending ? 'Saving…' : 'Save'}
            </button>
          ) : null}
        </div>
      </aside>

      {/* Right: live preview */}
      <main className="lg:col-span-8 space-y-4">
        {error ? (
          <div className="ix-card p-4 bg-rose-50 text-rose-800 text-sm">{error}</div>
        ) : null}
        {!data && !error ? (
          <div className="ix-card p-10 text-center text-sm text-slate-500">
            Configure on the left, the preview will render here.
          </div>
        ) : null}
        {data ? (
          <>
            {config.visualization.showKpiStrip && data.config.periods[0] ? (
              <KpiStrip data={data} />
            ) : null}
            <ChartsPanel data={data} />
            {config.visualization.showPivotTable ? <PivotTable data={data} /> : null}
            {data.warnings?.length ? (
              <div className="ix-card p-3 text-xs text-amber-800 bg-amber-50">
                {data.warnings.map((w, i) => (
                  <div key={i}>⚠ {w}</div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup tab
// ---------------------------------------------------------------------------
function SetupTab({
  config,
  setConfig,
}: {
  config: ReportConfig;
  setConfig: (c: ReportConfig) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Title</label>
        <input
          type="text"
          value={config.title}
          onChange={e => setConfig({ ...config, title: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[var(--bh-ink)] focus:outline-none dark:bg-slate-800 dark:border-slate-700"
        />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Description</label>
        <textarea
          rows={2}
          value={config.description || ''}
          onChange={e => setConfig({ ...config, description: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[var(--bh-ink)] focus:outline-none dark:bg-slate-800 dark:border-slate-700"
        />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Periods (max 4)</label>
        <div className="mt-2 space-y-2">
          {config.periods.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2">
              <input
                type="text"
                value={p.label}
                onChange={e => {
                  const next = [...config.periods];
                  next[i] = { ...p, label: e.target.value };
                  setConfig({ ...config, periods: next });
                }}
                placeholder="Label"
                className="w-32 rounded border border-slate-200 px-2 py-1 text-xs dark:bg-slate-800 dark:border-slate-700"
              />
              <input
                type="date"
                value={p.from}
                onChange={e => {
                  const next = [...config.periods];
                  next[i] = { ...p, from: e.target.value };
                  setConfig({ ...config, periods: next });
                }}
                className="rounded border border-slate-200 px-2 py-1 text-xs dark:bg-slate-800 dark:border-slate-700"
              />
              <input
                type="date"
                value={p.to}
                onChange={e => {
                  const next = [...config.periods];
                  next[i] = { ...p, to: e.target.value };
                  setConfig({ ...config, periods: next });
                }}
                className="rounded border border-slate-200 px-2 py-1 text-xs dark:bg-slate-800 dark:border-slate-700"
              />
              {config.periods.length > 1 ? (
                <button
                  onClick={() =>
                    setConfig({
                      ...config,
                      periods: config.periods.filter((_, j) => j !== i),
                    })
                  }
                  className="text-slate-400 hover:text-rose-600"
                  title="Remove"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ))}
          {config.periods.length < 4 ? (
            <button
              onClick={() => {
                const id = `p${config.periods.length + 1}_${Date.now()}`;
                setConfig({
                  ...config,
                  periods: [
                    ...config.periods,
                    { id, label: `Period ${config.periods.length + 1}`, from: config.periods[0]?.from || '2026-01-01', to: config.periods[0]?.to || '2026-04-30' },
                  ],
                });
              }}
              className="inline-flex items-center gap-1 text-xs text-[var(--bh-ink)] hover:underline"
            >
              <Plus size={12} /> Add period
            </button>
          ) : null}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Group by</label>
        <select
          value={config.groupBy.primary}
          onChange={e =>
            setConfig({
              ...config,
              groupBy: { ...config.groupBy, primary: e.target.value as GroupAxis },
            })
          }
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
        >
          {Object.entries(GROUP_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Metrics</label>
        <div className="mt-2 grid grid-cols-2 gap-1 max-h-56 overflow-y-auto pr-1">
          {ALL_METRICS.map(m => {
            const checked = config.metrics.includes(m);
            return (
              <label
                key={m}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded cursor-pointer ${
                  checked
                    ? 'bg-[var(--bh-ink)] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? config.metrics.filter(x => x !== m)
                      : [...config.metrics, m];
                    setConfig({ ...config, metrics: next });
                  }}
                  className="hidden"
                />
                {METRIC_LABEL[m]}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Filters</label>
        <div className="mt-2 space-y-2 text-xs">
          <FilterMulti
            label="Buildings"
            options={ALL_BUILDINGS}
            value={config.filters.buildings || []}
            onChange={v =>
              setConfig({ ...config, filters: { ...config.filters, buildings: v as BuildingCode[] } })
            }
          />
          <FilterMulti
            label="Bedrooms"
            options={ALL_BEDROOMS}
            value={config.filters.bedrooms || []}
            onChange={v =>
              setConfig({ ...config, filters: { ...config.filters, bedrooms: v as BedroomBucket[] } })
            }
          />
          <FilterMulti
            label="Channels"
            options={ALL_CHANNELS}
            value={config.filters.channels || []}
            onChange={v =>
              setConfig({ ...config, filters: { ...config.filters, channels: v as ChannelBucket[] } })
            }
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.filters.includeCancelled || false}
              onChange={e =>
                setConfig({
                  ...config,
                  filters: { ...config.filters, includeCancelled: e.target.checked },
                })
              }
            />
            Include cancelled reservations
          </label>
        </div>
      </div>
    </div>
  );
}

function FilterMulti({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <span className="text-slate-500">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {options.map(o => {
          const checked = value.includes(o);
          return (
            <button
              key={o}
              onClick={() => {
                onChange(checked ? value.filter(x => x !== o) : [...value, o]);
              }}
              className={`px-2 py-0.5 rounded ${
                checked
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200'
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compare tab
// ---------------------------------------------------------------------------
function CompareTab({
  config,
  setConfig,
}: {
  config: ReportConfig;
  setConfig: (c: ReportConfig) => void;
}) {
  const mode = config.comparison?.mode || 'none';
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Comparison mode</label>
        <select
          value={mode}
          onChange={e =>
            setConfig({
              ...config,
              comparison: {
                ...(config.comparison || { mode: 'none' as ComparisonMode }),
                mode: e.target.value as ComparisonMode,
              },
            })
          }
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
        >
          <option value="none">None</option>
          <option value="period">Period vs Period</option>
          <option value="group">Group vs Group</option>
          <option value="market">vs Market (PriceLabs)</option>
          <option value="target">vs Target</option>
        </select>
      </div>

      {mode === 'period' ? (
        <div>
          <label className="text-xs font-semibold uppercase text-slate-500">Baseline period</label>
          <select
            value={config.comparison?.baseline || ''}
            onChange={e =>
              setConfig({
                ...config,
                comparison: { ...(config.comparison || { mode: 'period' }), mode: 'period', baseline: e.target.value },
              })
            }
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
          >
            <option value="">— pick —</option>
            {config.periods.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {mode === 'group' ? (
        <div>
          <label className="text-xs font-semibold uppercase text-slate-500">Baseline group key</label>
          <input
            type="text"
            value={config.comparison?.baseline || ''}
            onChange={e =>
              setConfig({
                ...config,
                comparison: { ...(config.comparison || { mode: 'group' }), mode: 'group', baseline: e.target.value },
              })
            }
            placeholder="e.g. BH-435"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
          />
        </div>
      ) : null}

      {mode === 'target' ? (
        <div>
          <label className="text-xs font-semibold uppercase text-slate-500">Targets per metric</label>
          <div className="mt-1 space-y-1 text-xs">
            {config.metrics.map(m => (
              <div key={m} className="flex items-center gap-2">
                <span className="flex-1">{METRIC_LABEL[m]}</span>
                <input
                  type="number"
                  step="any"
                  value={config.comparison?.targets?.[m] ?? ''}
                  onChange={e =>
                    setConfig({
                      ...config,
                      comparison: {
                        mode: 'target',
                        targets: {
                          ...(config.comparison?.targets || {}),
                          [m]: e.target.value === '' ? undefined : Number(e.target.value),
                        },
                      },
                    })
                  }
                  className="w-24 rounded border border-slate-200 px-2 py-1 dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={config.alignDates || false}
          onChange={e => setConfig({ ...config, alignDates: e.target.checked })}
        />
        Calendar-align partial-year periods
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visualize tab
// ---------------------------------------------------------------------------
function VisualizeTab({
  config,
  setConfig,
}: {
  config: ReportConfig;
  setConfig: (c: ReportConfig) => void;
}) {
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={config.visualization.showKpiStrip}
          onChange={e =>
            setConfig({
              ...config,
              visualization: { ...config.visualization, showKpiStrip: e.target.checked },
            })
          }
        />
        Show KPI strip
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={config.visualization.showPivotTable}
          onChange={e =>
            setConfig({
              ...config,
              visualization: { ...config.visualization, showPivotTable: e.target.checked },
            })
          }
        />
        Show pivot table
      </label>

      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Charts</label>
        <div className="mt-2 space-y-2">
          {config.visualization.charts.map((c, i) => (
            <div key={c.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={c.type}
                  onChange={e => {
                    const next = [...config.visualization.charts];
                    next[i] = { ...c, type: e.target.value as ChartType };
                    setConfig({
                      ...config,
                      visualization: { ...config.visualization, charts: next },
                    });
                  }}
                  className="rounded border border-slate-200 px-2 py-1 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="time_series">Time series (line)</option>
                  <option value="grouped_bar">Grouped bar</option>
                  <option value="stacked_bar">Stacked bar</option>
                  <option value="bcg">BCG quadrant</option>
                  <option value="heatmap">Heatmap</option>
                </select>
                <select
                  value={c.metricKey}
                  onChange={e => {
                    const next = [...config.visualization.charts];
                    next[i] = { ...c, metricKey: e.target.value as MetricKey };
                    setConfig({
                      ...config,
                      visualization: { ...config.visualization, charts: next },
                    });
                  }}
                  className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  {config.metrics.map(m => (
                    <option key={m} value={m}>
                      {METRIC_LABEL[m]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    setConfig({
                      ...config,
                      visualization: {
                        ...config.visualization,
                        charts: config.visualization.charts.filter((_, j) => j !== i),
                      },
                    })
                  }
                  className="text-slate-400 hover:text-rose-600"
                >
                  <X size={14} />
                </button>
              </div>
              <input
                type="text"
                value={c.title || ''}
                onChange={e => {
                  const next = [...config.visualization.charts];
                  next[i] = { ...c, title: e.target.value };
                  setConfig({
                    ...config,
                    visualization: { ...config.visualization, charts: next },
                  });
                }}
                placeholder="Chart title"
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
          ))}
          <button
            onClick={() => {
              const newSpec: ChartSpec = {
                id: `c${Date.now()}`,
                type: 'grouped_bar',
                metricKey: config.metrics[0] || 'occupancy_pct',
              };
              setConfig({
                ...config,
                visualization: {
                  ...config.visualization,
                  charts: [...config.visualization.charts, newSpec],
                },
              });
            }}
            className="inline-flex items-center gap-1 text-xs text-[var(--bh-ink)] hover:underline"
          >
            <Plus size={12} /> Add chart
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commentary tab (AI auto-bullets)
// ---------------------------------------------------------------------------
function CommentaryTab({
  config,
  setConfig,
  data,
}: {
  config: ReportConfig;
  setConfig: (c: ReportConfig) => void;
  data: ReportData | null;
}) {
  const [bullets, setBullets] = useState(data?.commentary?.bullets || []);
  const [actions, setActions] = useState(data?.commentary?.action_items || []);
  const [generating, setGenerating] = useState(false);

  async function regen() {
    setGenerating(true);
    try {
      const res = await fetch('/api/beithady/reports/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config, commentary: true }),
      });
      const json = (await res.json()) as { data?: ReportData };
      if (json.data?.commentary) {
        setBullets(json.data.commentary.bullets || []);
        setActions(json.data.commentary.action_items || []);
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4 text-xs">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={config.enableAiCommentary !== false}
          onChange={e => setConfig({ ...config, enableAiCommentary: e.target.checked })}
        />
        Enable AI commentary (Haiku)
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={config.enableAnomalyDetection !== false}
          onChange={e => setConfig({ ...config, enableAnomalyDetection: e.target.checked })}
        />
        Flag anomalies (&gt;2σ)
      </label>

      <button
        onClick={regen}
        disabled={generating}
        className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        <Sparkles size={14} />
        {generating ? 'Generating…' : 'Generate AI conclusions'}
      </button>

      {bullets.length ? (
        <div>
          <div className="font-semibold text-slate-700 mb-1">Bullets</div>
          <ul className="space-y-1 list-disc pl-5">
            {bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {actions.length ? (
        <div>
          <div className="font-semibold text-slate-700 mb-1">Action items</div>
          <ul className="space-y-1 list-disc pl-5">
            {actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export tab
// ---------------------------------------------------------------------------
function ExportTab({
  config,
  data,
  canSave,
  onSave,
  savePending,
}: {
  config: ReportConfig;
  data: ReportData | null;
  canSave: boolean;
  onSave: () => void;
  savePending: boolean;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-slate-500">
        Save the report first to enable PDF / XLSX downloads and scheduling.
      </p>
      {canSave ? (
        <button
          onClick={onSave}
          disabled={savePending || !data}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          <Save size={14} />
          {savePending ? 'Saving…' : 'Save report'}
        </button>
      ) : (
        <p className="text-xs text-amber-700">Saving requires Business Analyst or admin role.</p>
      )}
      <div className="text-xs text-slate-500 mt-3">
        After saving you can:
      </div>
      <ul className="text-xs text-slate-600 list-disc pl-5">
        <li>Download A4 PDF with charts + commentary</li>
        <li>Download XLSX pivot table</li>
        <li>Schedule daily / weekly / monthly delivery via Email + WhatsApp</li>
      </ul>
    </div>
  );
}
