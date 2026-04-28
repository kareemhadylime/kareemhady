import Link from 'next/link';
import { X, Hash } from 'lucide-react';
import { getItem } from '@/lib/beithady/inventory/catalog';
import { getItemLedger, TX_TYPE_LABEL } from '@/lib/beithady/inventory/stock';

export async function LedgerDrawer({
  itemId, closeHref,
}: {
  itemId: string;
  closeHref: string;
}) {
  const [item, ledger] = await Promise.all([
    getItem(itemId),
    getItemLedger(itemId, { limit: 200 }),
  ]);

  if (!item) {
    return (
      <>
        <Link href={closeHref} aria-label="Close" className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px]" scroll={false} />
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white shadow-xl overflow-y-auto p-5">
          <div className="text-sm text-slate-500">Item not found.</div>
          <Link href={closeHref} className="text-cyan-700 underline text-xs">Close</Link>
        </div>
      </>
    );
  }

  const totalIn = ledger.filter(l => l.qty_delta > 0).reduce((s, l) => s + l.qty_delta, 0);
  const totalOut = ledger.filter(l => l.qty_delta < 0).reduce((s, l) => s + l.qty_delta, 0);

  return (
    <>
      <Link href={closeHref} aria-label="Close ledger" className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px]" scroll={false} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white dark:bg-slate-900 shadow-xl overflow-y-auto">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--bh-navy)' }}>
              {item.name_en}
            </h2>
            <div className="text-[11px] text-slate-500 inline-flex items-center gap-2">
              <code className="font-mono">{item.sku}</code>
              <span>·</span>
              <span>{item.uom}</span>
              <span>·</span>
              <span>min {item.min_qty}</span>
            </div>
          </div>
          <Link href={closeHref} scroll={false} aria-label="Close" className="text-slate-400 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100">
            <X size={18} />
          </Link>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Avg cost" value={item.avg_cost_egp > 0 ? `${item.avg_cost_egp.toFixed(2)} EGP` : '—'} />
            <Stat label="Total IN (last 200)" value={`+${totalIn.toFixed(0)} ${item.uom}`} tone="emerald" />
            <Stat label="Total OUT (last 200)" value={`${totalOut.toFixed(0)} ${item.uom}`} tone="rose" />
          </div>

          {/* Ledger */}
          <div>
            <h3 className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
              Transaction ledger ({ledger.length} entries)
            </h3>
            {ledger.length === 0 ? (
              <div className="ix-card p-6 text-center text-slate-500 text-xs">
                No transactions yet. The first GRN posting against this item will appear here.
              </div>
            ) : (
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left px-2 py-1.5">When</th>
                      <th className="text-left px-2 py-1.5">Type</th>
                      <th className="text-left px-2 py-1.5">Warehouse</th>
                      <th className="text-left px-2 py-1.5">Batch</th>
                      <th className="text-right px-2 py-1.5">Δ qty</th>
                      <th className="text-right px-2 py-1.5">Cost</th>
                      <th className="text-left px-2 py-1.5">Doc / Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map(l => {
                      const meta = TX_TYPE_LABEL[l.type] || { en: l.type, tone: 'bg-slate-100', sign: '±' };
                      return (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">
                            {new Date(l.ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.tone}`}>{meta.en}</span>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[10px]">{l.warehouse_code}</td>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">
                            {l.batch_no === '__bulk__' ? '—' : l.batch_no}
                          </td>
                          <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${l.qty_delta > 0 ? 'text-emerald-700' : l.qty_delta < 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                            {l.qty_delta > 0 ? '+' : ''}{l.qty_delta.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                            {l.unit_cost_egp > 0 ? l.unit_cost_egp.toFixed(2) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-[10px] text-slate-500">
                            {l.doc_type && (
                              <span className="inline-flex items-center gap-1">
                                <Hash size={9} />
                                {l.doc_type.toUpperCase()}
                              </span>
                            )}
                            {l.ref_reservation_id && (
                              <div className="text-[9px] text-cyan-700">res: {l.ref_reservation_id.slice(0, 8)}…</div>
                            )}
                            {l.note && <div className="italic">{l.note}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'rose' }) {
  const cls = tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-700' : 'text-slate-700';
  return (
    <div className="ix-card p-2">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
