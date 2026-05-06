'use client';
import { DivergingBars } from '../charts/diverging-bars';
import type { PortfolioContractRow } from '@/lib/fmplus/performance/types';

export function PortfolioVarianceBar({ rows }: { rows: PortfolioContractRow[] }) {
  return (
    <section className="ix-card p-6">
      <h2 className="text-base font-semibold tracking-tight font-serif mb-3">Variance by Contract</h2>
      <DivergingBars
        data={rows.map(r => ({ id: String(r.contract_id), name: r.contract_name, variance_pct: r.variance_pct, status: r.health }))}
        onRowClick={(id) => { window.location.href = rows.find(r => String(r.contract_id) === id)!.drill_url; }}
      />
    </section>
  );
}
