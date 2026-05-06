'use client';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { ArAgingBlock, ArBucket } from '@/lib/fmplus/performance/types';

const BUCKET_LABELS: Record<ArBucket, string> = {
  within_terms:    'Within terms',
  overdue_1_30:    '1–30 d overdue',
  overdue_31_60:   '31–60 d overdue',
  overdue_61_90:   '61–90 d overdue',
  overdue_90_plus: '90+ d overdue',
};
const BUCKET_COLORS: Record<ArBucket, string> = {
  within_terms:    'bg-emerald-500',
  overdue_1_30:    'bg-amber-500',
  overdue_31_60:   'bg-orange-500',
  overdue_61_90:   'bg-red-500',
  overdue_90_plus: 'bg-red-700',
};

function fmtEgp(n: number) {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

export function ArAgingPanel({ block, contractId }: { block: ArAgingBlock | null; contractId: number }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('ar_aging');
  if (!visible || !block || block.lines.length === 0) return null;
  const max = Math.max(1, ...block.buckets.map(b => b.amount));
  const overdueCount = block.overdue_count;
  return (
    <section id="perf-ar-aging" className="ix-card p-6 scroll-mt-20">
      <PanelHeader
        title="AR Aging"
        subtitle={
          block.payment_terms_days != null
            ? `Payment terms: Net ${block.payment_terms_days} days · ${overdueCount} overdue invoice${overdueCount === 1 ? '' : 's'}`
            : `Payment terms not specified · all balances counted as 'within terms'`
        }
        collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide}
      />
      {!collapsed && (
        <div className="space-y-5">
          {/* Top tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-slate-900/60 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold">Total Outstanding</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-fmplus-yellow font-serif">{fmtEgp(block.total_outstanding)}</p>
              <p className="text-xs text-slate-400 mt-1">EGP · {block.lines.length} invoices</p>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold">Within Terms</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-emerald-300 font-serif">{fmtEgp(block.within_terms_amount)}</p>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold">Overdue</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 font-serif ${overdueCount > 0 ? 'text-red-300' : 'text-slate-400'}`}>{fmtEgp(block.overdue_amount)}</p>
              <p className="text-xs text-slate-400 mt-1">{overdueCount} invoice{overdueCount === 1 ? '' : 's'}</p>
            </div>
          </div>

          {/* Bucket bars */}
          <div className="space-y-1.5">
            {block.buckets.filter(b => b.amount > 0).map(b => (
              <div key={b.bucket} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 text-slate-300">{BUCKET_LABELS[b.bucket]}</span>
                <div className="flex-1 h-3 bg-slate-700/40 rounded-full overflow-hidden">
                  <div style={{ width: `${(b.amount / max) * 100}%` }} className={`h-full ${BUCKET_COLORS[b.bucket]}`} />
                </div>
                <span className="w-20 text-right tabular-nums text-fmplus-yellow font-semibold">{fmtEgp(b.amount)}</span>
                <span className="w-12 text-right tabular-nums text-slate-400">{b.count}</span>
              </div>
            ))}
          </div>

          {/* Overdue line list (top 10 by days_outstanding) */}
          {overdueCount > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle size={12} /> Overdue Invoices
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-fmplus-gold uppercase">
                    <tr>
                      <th className="text-left py-1">Invoice</th>
                      <th className="text-left">Customer</th>
                      <th className="text-right">Date</th>
                      <th className="text-right">Days Overdue</th>
                      <th className="text-right">Outstanding</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {block.lines.filter(l => l.bucket !== 'within_terms').slice(0, 10).map(l => (
                      <tr key={l.line_id} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                        <td className="py-2 text-slate-300">{l.invoice_ref ?? '—'}</td>
                        <td className="text-slate-300">{l.partner_name}</td>
                        <td className="text-right tabular-nums text-slate-400">{l.invoice_date}</td>
                        <td className={`text-right tabular-nums font-semibold ${l.days_overdue > 60 ? 'text-red-300' : l.days_overdue > 30 ? 'text-orange-300' : 'text-amber-300'}`}>{l.days_overdue}</td>
                        <td className="text-right tabular-nums text-fmplus-yellow font-semibold">{fmtEgp(l.amount_residual)}</td>
                        <td>
                          <Link
                            href={`/fmplus/financial/budget/variance?contract=${contractId}&move=${l.move_id}`}
                            className="text-fmplus-gold hover:text-fmplus-yellow"
                          >→</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {block.lines.filter(l => l.bucket !== 'within_terms').length > 10 && (
                <p className="text-xs text-slate-500 mt-2 px-2">
                  Showing top 10 of {block.lines.filter(l => l.bucket !== 'within_terms').length} overdue invoices.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
