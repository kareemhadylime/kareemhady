import Link from 'next/link';
import { Plus, ClipboardCheck, ChevronRight } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { listCountSessions, COUNT_STATUS_LABEL, type CountSessionStatus } from '@/lib/beithady/inventory/counts';

export const dynamic = 'force-dynamic';

export default async function InventoryCountsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const sp = await searchParams;
  const canWrite = roles.some(r => ['admin', 'manager', 'ops', 'warehouse_manager'].includes(r));

  const sessions = await listCountSessions({ status: (sp.status as CountSessionStatus | 'all') || 'all' });
  const open = sessions.filter(s => s.status === 'open' || s.status === 'in_progress').length;
  const pendingApproval = sessions.filter(s => s.status === 'pending_approval').length;

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Counts & Adjustments' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Counts"
        title="Counts & Adjustments"
        subtitle={`${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${open} open · ${pendingApproval} pending approval. Cycle (random subset) or physical (full warehouse). Variance > 10% needs warehouse_manager approval.`}
      />

      <section className="flex items-center gap-2 flex-wrap text-xs">
        <strong className="text-[10px] uppercase tracking-wide text-slate-500 mr-1">Status:</strong>
        <Chip href="?" active={!sp.status || sp.status === 'all'} label="All" />
        {(Object.keys(COUNT_STATUS_LABEL) as CountSessionStatus[]).map(s => (
          <Chip key={s} href={`?status=${s}`} active={sp.status === s} label={COUNT_STATUS_LABEL[s].en} />
        ))}
      </section>

      <section className="flex items-center justify-end">
        {canWrite && (
          <Link href="/beithady/inventory/counts/new"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 shadow-sm">
            <Plus size={14} /> New count session
          </Link>
        )}
      </section>

      <section className="ix-card overflow-hidden">
        {sessions.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <ClipboardCheck size={32} className="mx-auto text-slate-300 mb-2" />
            <p>No count sessions yet.</p>
            {canWrite && <p className="text-[11px] mt-2">Click <strong>New count session</strong> to start a cycle or physical count.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">Session #</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Warehouse</th>
                  <th className="text-right px-3 py-2">Lines</th>
                  <th className="text-right px-3 py-2">Counted</th>
                  <th className="text-right px-3 py-2">Variance (EGP)</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => {
                  const progressPct = s.line_count > 0 ? Math.round((s.counted_count / s.line_count) * 100) : 0;
                  return (
                    <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-[11px]">
                        <Link href={`/beithady/inventory/counts/${s.id}`} className="hover:text-cyan-700 hover:underline">{s.session_no}</Link>
                      </td>
                      <td className="px-3 py-2 text-[11px] capitalize">{s.type}</td>
                      <td className="px-3 py-2 text-[11px]">
                        <div>{s.warehouse_name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{s.warehouse_code}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.line_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={progressPct === 100 ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                          {s.counted_count}/{s.line_count} ({progressPct}%)
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.variance_total_egp !== 0
                          ? <span className={s.variance_total_egp > 0 ? 'text-amber-700' : 'text-rose-700'}>
                              {Number(s.variance_total_egp).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </span>
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${COUNT_STATUS_LABEL[s.status].tone}`}>
                          {COUNT_STATUS_LABEL[s.status].en}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/beithady/inventory/counts/${s.id}`} className="text-cyan-700 hover:text-cyan-900 inline-flex items-center gap-0.5 text-[11px]">
                          Open <ChevronRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Counts · Phase M.10 · Posting via beithady_inv_post_count_session (writes count_adjust transactions)
      </footer>
    </BeithadyShell>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${
      active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
    }`}>
      {label}
    </Link>
  );
}
