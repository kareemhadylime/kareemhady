import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Warehouse, Calendar, Hash } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { getCountSession, COUNT_STATUS_LABEL } from '@/lib/beithady/inventory/counts';
import { CountEntryPanel } from '../_components/count-entry-panel';

export const dynamic = 'force-dynamic';

export default async function CountSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const { id } = await params;
  const session = await getCountSession(id);
  if (!session) notFound();

  const canWrite = roles.some(r => ['admin', 'manager', 'ops', 'warehouse_manager'].includes(r));
  const canApprove = roles.some(r => ['admin', 'manager', 'warehouse_manager'].includes(r));
  const editable = canWrite && (session.status === 'open' || session.status === 'in_progress');

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Counts', href: '/beithady/inventory/counts' },
        { label: session.session_no },
      ]}
      containerClass="max-w-6xl"
    >
      <BeithadyHeader
        eyebrow={`Beit Hady · Inventory · Count · ${session.session_no}`}
        title={session.session_no}
        subtitle={`${session.type === 'cycle' ? 'Cycle count' : 'Physical count'} · ${session.warehouse_name} (${session.warehouse_code})`}
      />

      <section className="ix-card p-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${COUNT_STATUS_LABEL[session.status].tone}`}>
              {COUNT_STATUS_LABEL[session.status].en}
            </span>
            {session.cleaner_session_name && (
              <span className="text-[11px] text-emerald-700">👤 {session.cleaner_session_name}</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 inline-flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><Warehouse size={11} /> {session.warehouse_code}</span>
            {session.scheduled_for && <span className="inline-flex items-center gap-1"><Calendar size={11} /> Scheduled {session.scheduled_for}</span>}
            {session.posted_at && <span className="inline-flex items-center gap-1 text-emerald-700"><Hash size={11} /> Posted {new Date(session.posted_at).toLocaleString('en-GB')}</span>}
          </div>
          {session.notes && <div className="text-[11px] text-slate-500 italic mt-1">{session.notes}</div>}
        </div>
        {session.variance_total_egp !== 0 && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Variance posted</div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--bh-navy)' }}>
              {session.variance_total_egp.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              <span className="text-sm text-slate-500 ml-1">EGP</span>
            </div>
          </div>
        )}
      </section>

      <CountEntryPanel session={session} editable={editable} canApprove={canApprove} canWrite={canWrite} />

      <Link href="/beithady/inventory/counts" className="text-xs text-cyan-700 hover:underline inline-flex items-center gap-1">
        <ChevronLeft size={12} /> Back to count sessions
      </Link>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Count · Phase M.10 · Posting writes count_adjust transactions per non-zero variance line
      </footer>
    </BeithadyShell>
  );
}
