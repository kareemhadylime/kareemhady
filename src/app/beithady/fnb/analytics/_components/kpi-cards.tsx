'use client';
import { useEffect, useState } from 'react';

interface SummaryShape {
  today: { revenue_usd: number; orders: number; avg_ticket_usd: number };
  yesterday: { revenue_usd: number; orders: number };
  avg_prep_minutes: number | null;
  top_item: { name: string; count: number; revenue_usd: number } | null;
}

export function KpiCards() {
  const [data, setData] = useState<SummaryShape | null>(null);
  useEffect(() => {
    fetch('/api/beithady/fnb/analytics/summary').then(r => r.json()).then(setData);
  }, []);
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Kpi label="Revenue today" value={`$${data.today.revenue_usd.toFixed(2)}`} delta={data.today.revenue_usd - data.yesterday.revenue_usd} />
      <Kpi label="Orders today" value={data.today.orders} />
      <Kpi label="Avg ticket" value={`$${data.today.avg_ticket_usd.toFixed(2)}`} />
      <Kpi label="Avg prep time" value={data.avg_prep_minutes ? `${data.avg_prep_minutes} min` : '—'} />
      {data.top_item && (
        <div className="ix-card p-4 col-span-2 md:col-span-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Top item</p>
          <p className="text-base font-semibold mt-1">
            {data.top_item.name}{' '}
            <span className="text-sm text-slate-500">
              · {data.top_item.count} sold · ${data.top_item.revenue_usd.toFixed(2)} revenue
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string | number; delta?: number }) {
  return (
    <div className="ix-card p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
      {delta !== undefined && (
        <p className={`text-xs mt-1 ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(2)} vs yesterday
        </p>
      )}
    </div>
  );
}
