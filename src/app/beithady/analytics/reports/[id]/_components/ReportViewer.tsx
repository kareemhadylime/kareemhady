'use client';

import { useEffect, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import type { ReportConfig, ReportData } from '@/lib/beithady/reports/types';
import {
  KpiStrip,
  ChartsPanel,
  PivotTable,
} from '../../builder/_components/charts/index';

export function ReportViewer({
  reportId,
  config,
  initialData,
  canEdit,
}: {
  reportId: string;
  config: ReportConfig;
  initialData: ReportData | null;
  canEdit: boolean;
}) {
  const [data, setData] = useState<ReportData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If no cached run, auto-fetch on mount
  useEffect(() => {
    if (!data) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/beithady/reports/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config, commentary: true }),
      });
      const json = (await res.json()) as { data?: ReportData; error?: string };
      if (json.error) throw new Error(json.error);
      setData(json.data || null);
      // Persist as cache (best-effort)
      if (canEdit && json.data) {
        await fetch(`/api/beithady/reports/${reportId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ last_run_data: json.data, commentary: json.data.commentary }),
        }).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--bh-ink)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2c4d7a] disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshingâ€¦' : 'Refresh data'}
        </button>
        {data ? (
          <span className="text-xs text-slate-500">
            Run at {new Date(data.runAt).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        ) : null}
      </div>

      {error ? <div className="ix-card p-4 bg-rose-50 text-rose-800 text-sm">{error}</div> : null}

      {data ? (
        <>
          {config.visualization.showKpiStrip ? <KpiStrip data={data} /> : null}
          <ChartsPanel data={data} />
          {config.visualization.showPivotTable ? <PivotTable data={data} /> : null}
          {data.commentary?.bullets?.length ? (
            <div className="ix-card p-5">
              <h3 className="text-sm font-semibold text-[var(--bh-ink)] dark:text-amber-100 mb-3">
                Conclusions
              </h3>
              <ul className="space-y-2 text-sm list-disc pl-5">
                {data.commentary.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              {data.commentary.action_items?.length ? (
                <>
                  <h4 className="text-xs font-semibold text-slate-500 mt-4 mb-2 uppercase">
                    Action items
                  </h4>
                  <ul className="space-y-1 text-sm list-disc pl-5">
                    {data.commentary.action_items.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : !loading ? (
        <div className="ix-card p-10 text-center text-sm text-slate-500">
          No data yet. Click <Play size={12} className="inline -mt-0.5" /> Refresh to compute.
        </div>
      ) : null}
    </div>
  );
}
