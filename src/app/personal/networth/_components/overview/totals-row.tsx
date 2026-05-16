type Kpis = {
  totalAssetsEgp: number;
  totalLiabilitiesEgp: number;
  netWorthEgp: number;
};

export function TotalsRow({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <TotalCard
        label="Total Assets"
        value={kpis.totalAssetsEgp}
        accent="emerald"
      />
      <TotalCard
        label="Total Liabilities"
        value={kpis.totalLiabilitiesEgp}
        accent="rose"
      />
      <TotalCard
        label="Net Worth"
        value={kpis.netWorthEgp}
        accent="indigo"
      />
    </div>
  );
}

function TotalCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'emerald' | 'rose' | 'indigo';
}) {
  const colour =
    accent === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-400'
      : accent === 'rose'
        ? 'text-rose-700 dark:text-rose-400'
        : 'text-indigo-700 dark:text-indigo-400';
  return (
    <div className="ix-card p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${colour}`}>
        EGP {Number(value).toLocaleString()}
      </div>
    </div>
  );
}
