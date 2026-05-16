function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function LiabilitiesKpiStrip({
  totalEgp,
  monthlyOutflow,
  highestApr,
  ytdInterestEgp,
}: {
  totalEgp: number;
  monthlyOutflow: number;
  highestApr: number;
  ytdInterestEgp: number;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Kpi label="Total balance (EGP)" value={`EGP ${fmt(totalEgp)}`} />
      <Kpi label="Monthly outflow" value={fmt(monthlyOutflow)} />
      <Kpi
        label="Highest APR"
        value={highestApr > 0 ? `${fmt(highestApr)}%` : '—'}
      />
      <Kpi label="YTD interest (EGP)" value={`EGP ${fmt(ytdInterestEgp)}`} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="ix-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="text-lg font-semibold text-slate-900 dark:text-slate-50 mt-1 tabular-nums">
        {value}
      </div>
    </div>
  );
}
