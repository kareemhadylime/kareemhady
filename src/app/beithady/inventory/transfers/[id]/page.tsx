import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ArrowLeftRight, Calendar, Hash } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { getTransfer } from '@/lib/beithady/inventory/transfers';

export const dynamic = 'force-dynamic';

export default async function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireBeithadyPermission('inventory', 'read');
  const { id } = await params;
  const t = await getTransfer(id);
  if (!t) notFound();

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Transfers', href: '/beithady/inventory/transfers' },
        { label: id.slice(0, 8) + '…' },
      ]}
      containerClass="max-w-5xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Transfer"
        title={`Transfer ${id.slice(0, 8)}…`}
        subtitle={`${t.src_warehouse_name} → ${t.dst_warehouse_name}`}
      />

      <section className="ix-card p-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="text-[11px] text-slate-500 inline-flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <ArrowLeftRight size={11} /> Atomic post (both legs committed)
            </span>
            <span className="inline-flex items-center gap-1"><Calendar size={11} /> {new Date(t.posted_at).toLocaleString('en-GB')}</span>
            <span className="inline-flex items-center gap-1"><Hash size={11} className="font-mono text-[10px]" />{id}</span>
          </div>
          <div className="text-xs text-slate-700 mt-1">
            <strong>{t.src_warehouse_name}</strong> ({t.src_warehouse_code}) → <strong>{t.dst_warehouse_name}</strong> ({t.dst_warehouse_code})
          </div>
          {t.first_note && <div className="text-[11px] text-slate-500 italic mt-1">{t.first_note}</div>}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Total value</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--bh-navy)' }}>
            {t.total_value_egp.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            <span className="text-sm text-slate-500 ml-1">EGP</span>
          </div>
          <div className="text-[10px] text-slate-400">{t.total_qty} units · {t.line_count} line{t.line_count === 1 ? '' : 's'}</div>
        </div>
      </section>

      <section className="ix-card overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
          <h3 className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Lines ({t.lines.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-3 py-1.5 w-10">#</th>
                <th className="text-left px-3 py-1.5">Item</th>
                <th className="text-right px-3 py-1.5">Qty moved</th>
                <th className="text-left px-3 py-1.5">Batch</th>
                <th className="text-right px-3 py-1.5">Unit cost</th>
                <th className="text-right px-3 py-1.5">Value (EGP)</th>
              </tr>
            </thead>
            <tbody>
              {t.lines.map((l, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 text-slate-400 tabular-nums">{l.doc_line_no || i + 1}</td>
                  <td className="px-3 py-1.5">
                    <div className="font-mono text-[11px]">{l.item_sku}</div>
                    <div className="text-[10px] text-slate-500">{l.item_name_en}</div>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.qty} {l.item_uom}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">
                    {l.batch_no === '__bulk__' ? '—' : l.batch_no}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.unit_cost_egp.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                    {(l.qty * l.unit_cost_egp).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Link href="/beithady/inventory/transfers" className="text-xs text-cyan-700 hover:underline inline-flex items-center gap-1">
        <ChevronLeft size={12} /> Back to transfers
      </Link>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Transfer · Phase M.9 · Each transfer = paired transfer_out + transfer_in transactions sharing this doc_id
      </footer>
    </BeithadyShell>
  );
}
