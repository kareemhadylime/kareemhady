import { getFunnelStages } from '@/lib/beithady/ads/funnel';

export async function FunnelTab({
  range, campaignId, buildingCode,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  buildingCode?: string;
}) {
  const { stages } = await getFunnelStages({
    from: range.from, to: range.to, campaignId, buildingCode,
  });
  const max = stages.reduce((m, s) => Math.max(m, s.count), 0) || 1;
  const totalEmpty = stages.every(s => s.count === 0);

  if (totalEmpty) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No funnel data yet for this range.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="ix-card p-5 space-y-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Conversion funnel</h3>
        {stages.map((s, i) => (
          <div key={s.key}>
            <div className="grid grid-cols-[120px_1fr] items-center gap-3 text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-medium">{s.label}</span>
              <div
                className="h-5 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden"
                title={`${s.count.toLocaleString()}`}
              >
                <div
                  className="h-full bg-slate-400/70 dark:bg-slate-500/70"
                  style={{ width: `${(s.count / max) * 100}%` }}
                />
              </div>
            </div>
            {i < stages.length - 1 && stages[i + 1].conversion_pct_from_prev != null && (
              <div className="grid grid-cols-[120px_1fr] gap-3 text-[10px] text-slate-400 my-0.5">
                <span />
                <span className="text-center">↓ {stages[i + 1].conversion_pct_from_prev}%</span>
              </div>
            )}
          </div>
        ))}
        {buildingCode && (
          <div className="text-[11px] text-slate-400 italic mt-2">
            * Impressions/Reach/Clicks are campaign-aggregate (not per-building); only Leads/Bookings reflect the {buildingCode} filter.
          </div>
        )}
      </div>

      <div className="ix-card p-5">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-2">Stage</th>
              <th className="py-2 text-right">Count</th>
              <th className="py-2 text-right">% of previous</th>
              <th className="py-2 text-right">% of top</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {stages.map(s => (
              <tr key={s.key} className="text-slate-700 dark:text-slate-200">
                <td className="py-1.5 font-medium">{s.label}</td>
                <td className="py-1.5 text-right">{s.count.toLocaleString()}</td>
                <td className="py-1.5 text-right">{s.conversion_pct_from_prev != null ? `${s.conversion_pct_from_prev}%` : '—'}</td>
                <td className="py-1.5 text-right" title={s.conversion_pct_from_top != null ? `${s.conversion_pct_from_top}%` : undefined}>
                  {s.conversion_pct_from_top != null ? `${s.conversion_pct_from_top}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
