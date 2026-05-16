'use client';

type Charity = {
  totalEgp: number;
  monthlyAvg: number;
  yearlyGoalEgp: number | null;
  progressPct: number | null;
};

export function CharityYtd({ charity }: { charity: Charity }) {
  const pct = charity.progressPct ?? 0;
  const goal = charity.yearlyGoalEgp;
  return (
    <div className="ix-card p-5">
      <div className="text-sm font-semibold mb-1">Charity YTD</div>
      <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
        EGP {Number(charity.totalEgp).toLocaleString()}
      </div>
      <div className="text-xs text-slate-500 mt-1">
        Monthly avg: EGP {Number(charity.monthlyAvg).toLocaleString()}
      </div>
      {goal != null ? (
        <div className="mt-3">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Goal: EGP {Number(goal).toLocaleString()}</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <div className="h-2 mt-1 bg-slate-100 dark:bg-slate-800 rounded">
            <div
              className="h-2 bg-emerald-500 rounded transition-all"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-slate-500">
          No yearly goal set.{' '}
          <a href="/personal/networth/setup" className="text-indigo-600 hover:underline">
            Configure in Setup →
          </a>
        </div>
      )}
    </div>
  );
}
