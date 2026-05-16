import { getCohortMatrix, cellColorBucket } from '@/lib/beithady/ads/cohort';

export async function CohortTab({
  range: _range, buildingCode,
}: {
  range: { from: string; to: string; preset: string; compare: boolean };
  campaignId?: number;
  platforms?: Array<'meta' | 'google' | 'tiktok'>;
  buildingCode?: string;
}) {
  // Cohort tab ignores date filter (inherently rolling); honors per-building.
  const { cohorts } = await getCohortMatrix({ weeksBack: 6, buildingCode });

  if (cohorts.length === 0 || cohorts.every(c => c.leads === 0)) {
    return (
      <div className="ix-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Not enough lead history yet for cohort analysis.
        <div className="mt-2 text-xs">Need at least 6 complete weeks of leads.</div>
      </div>
    );
  }

  const lagHeaders = ['+1w', '+2w', '+3w', '+4w', '+5w+'];
  const totalsByLag = lagHeaders.map((_, i) =>
    cohorts.reduce((s, c) => s + c.bookings_by_lag[i], 0)
  );

  return (
    <div className="ix-card p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Lead → booking conversion by week</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Each row = a cohort of leads from that week. Columns = % of those leads who booked N weeks later.
        </p>
      </div>
      <table className="w-full text-xs tabular-nums">
        <thead className="text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-2"></th>
            {lagHeaders.map(h => <th key={h} className="py-2 text-center">{h}</th>)}
            <th className="py-2 text-right">Leads</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {cohorts.map(c => (
            <tr key={c.week_start} className="text-slate-700 dark:text-slate-200">
              <td className="py-1.5 font-medium">{c.week_label}</td>
              {c.conversion_pcts_by_lag.map((pct, i) => (
                <td
                  key={i}
                  className={`py-1.5 text-center ${cellColorBucket(pct)}`}
                  title={`${c.bookings_by_lag[i]} bookings of ${c.leads} leads`}
                >
                  {c.leads === 0 ? '—' : `${pct}%`}
                </td>
              ))}
              <td className="py-1.5 text-right">{c.leads.toLocaleString()}</td>
            </tr>
          ))}
          <tr className="text-[11px] text-slate-500 dark:text-slate-400">
            <td className="py-2 font-medium">Totals</td>
            {totalsByLag.map((n, i) => <td key={i} className="py-2 text-center">{n}</td>)}
            <td className="py-2 text-right">{cohorts.reduce((s, c) => s + c.leads, 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
