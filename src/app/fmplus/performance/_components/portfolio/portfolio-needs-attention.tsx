import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { PortfolioContractRow } from '@/lib/fmplus/performance/types';

export function PortfolioNeedsAttention({ rows }: { rows: PortfolioContractRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="text-base font-semibold tracking-tight font-serif mb-3 flex items-center gap-2">
        <AlertTriangle size={16} className="text-orange-400" /> Needs Attention
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {rows.slice(0, 6).map(r => (
          <Link key={r.contract_id} href={r.drill_url} className="ix-card p-4 hover:shadow-lg transition">
            <p className="text-sm text-slate-200 font-semibold">{r.contract_name}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">{r.customer}</p>
            <p className={`text-2xl font-bold tabular-nums mt-2 ${r.health === 'bad' ? 'text-red-400' : 'text-orange-400'}`}>{(r.variance_pct * 100).toFixed(1)}%</p>
            <p className="text-xs text-fmplus-gold mt-2">View →</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
