import Link from 'next/link';

interface Anomaly {
  contract_id: number;
  project_name: string;
  var_pct: number | null;
}

export function AnomalyBanner({ anomalies }: { anomalies: Anomaly[] }) {
  if (anomalies.length === 0) return null;
  return (
    <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-4">
      <strong className="text-sm text-text-primary">Anomalies — top {anomalies.length} worst variance</strong>
      <ul className="mt-2 space-y-1 text-xs">
        {anomalies.map(a => (
          <li key={a.contract_id}>
            <Link href={`/fmplus/financial/budget/variance?contract=${a.contract_id}`}
              className="text-accent hover:underline font-medium">
              {a.project_name}
            </Link>
            {' '}— {a.var_pct != null ? `${(a.var_pct * 100).toFixed(1)}% over budget` : 'no data'}
          </li>
        ))}
      </ul>
    </div>
  );
}
