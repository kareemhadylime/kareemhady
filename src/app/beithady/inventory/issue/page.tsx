import Link from 'next/link';
import { Plus, Search, PackageMinus, ChevronRight, AlertCircle, Bot, User } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { listIssues, ISSUE_STATUS_LABEL, ISSUE_TYPE_LABEL, type IssueStatus, type IssueType } from '@/lib/beithady/inventory/issue';

export const dynamic = 'force-dynamic';

export default async function InventoryIssueListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; search?: string }>;
}) {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const sp = await searchParams;
  const canWrite = roles.some(r => ['admin', 'manager', 'ops', 'warehouse_manager'].includes(r));

  const issues = await listIssues({
    status: (sp.status as IssueStatus | 'all') || 'all',
    type: (sp.type as IssueType | 'all') || 'all',
    search: sp.search,
  });

  const pendingApproval = issues.filter(i => i.status === 'pending_approval').length;
  const readyToPost = issues.filter(i => i.status === 'approved').length;
  const autoFromCron = issues.filter(i => i.created_via === 'auto_rule').length;

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Dispensing (Issue)' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Dispensing"
        title="Issues"
        subtitle={`${issues.length} issue${issues.length === 1 ? '' : 's'} · ${autoFromCron} auto-fired by rules engine. 6 types: per-reservation · maintenance · welcome tray · owner · damage · transfer.`}
      />

      {(pendingApproval > 0 || readyToPost > 0) && (
        <section className="ix-card border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertCircle size={14} className="inline mr-1.5" />
          {pendingApproval > 0 && <><strong>{pendingApproval}</strong> awaiting approval{readyToPost > 0 ? ' · ' : '. '}</>}
          {readyToPost > 0 && <><strong>{readyToPost}</strong> approved & ready to post.</>}
        </section>
      )}

      <section className="flex items-center gap-2 flex-wrap text-xs">
        <strong className="text-[10px] uppercase tracking-wide text-slate-500 mr-1">Type:</strong>
        <Chip href="?" active={!sp.type || sp.type === 'all'} label="All" />
        {(Object.keys(ISSUE_TYPE_LABEL) as IssueType[]).map(t => (
          <Chip key={t} href={`?type=${t}`} active={sp.type === t} label={ISSUE_TYPE_LABEL[t].en} />
        ))}
      </section>
      <section className="flex items-center gap-2 flex-wrap text-xs">
        <strong className="text-[10px] uppercase tracking-wide text-slate-500 mr-1">Status:</strong>
        <Chip href="?" active={!sp.status || sp.status === 'all'} label="All" />
        {(Object.keys(ISSUE_STATUS_LABEL) as IssueStatus[]).map(s => (
          <Chip key={s} href={`?status=${s}`} active={sp.status === s} label={ISSUE_STATUS_LABEL[s].en} />
        ))}
      </section>

      <section className="flex items-center justify-between gap-3 flex-wrap">
        <form action="" method="get" className="flex items-center gap-2 flex-wrap">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          {sp.type && <input type="hidden" name="type" value={sp.type} />}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="search" name="search" defaultValue={sp.search || ''} placeholder="Search issue # / notes / cleaner…" className="ix-input pl-8 w-[280px]" />
          </div>
          <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700">Apply</button>
          {(sp.search || sp.status || sp.type) && (
            <Link href="/beithady/inventory/issue" className="text-[11px] text-slate-500 hover:text-slate-700">Clear</Link>
          )}
        </form>
        {canWrite && (
          <Link href="/beithady/inventory/issue/new" className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 shadow-sm">
            <Plus size={14} /> New issue
          </Link>
        )}
      </section>

      <section className="ix-card overflow-hidden">
        {issues.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <PackageMinus size={32} className="mx-auto text-slate-300 mb-2" />
            <p>No issues match your filter.</p>
            {canWrite && issues.length === 0 && !sp.status && !sp.type && !sp.search && (
              <p className="text-[11px] mt-2">Click <strong>New issue</strong> for manual entry, or wait for the auto-rules cron to fire (Cairo 14:00 daily).</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">Issue #</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Warehouse</th>
                  <th className="text-left px-3 py-2">Reference</th>
                  <th className="text-right px-3 py-2">Lines</th>
                  <th className="text-right px-3 py-2">Sub-total (EGP)</th>
                  <th className="text-left px-3 py-2">Source</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {issues.map(i => (
                  <tr key={i.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-[11px]">
                      <Link href={`/beithady/inventory/issue/${i.id}`} className="hover:text-cyan-700 hover:underline">{i.issue_no}</Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ISSUE_TYPE_LABEL[i.type].tone}`}>
                        {ISSUE_TYPE_LABEL[i.type].en}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      <div>{i.warehouse_name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{i.warehouse_code}</div>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-500 font-mono">
                      {i.ref_reservation_id && <div>res: {i.ref_reservation_id.slice(0, 12)}…</div>}
                      {i.ref_task_id && <div>task: {i.ref_task_id.slice(0, 12)}…</div>}
                      {i.ref_owner && <div>owner: {i.ref_owner}</div>}
                      {i.ref_kit_id && <div>kit: {i.ref_kit_id.slice(0, 12)}…</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{i.line_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {i.sub_total_egp > 0 ? Number(i.sub_total_egp).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      {i.created_via === 'auto_rule' && <Bot size={11} className="inline text-cyan-600" />}
                      {i.created_via === 'mobile_pin' && <span className="text-[10px] text-emerald-600">📱</span>}
                      {i.created_via === 'wa_inbound' && <span className="text-[10px] text-emerald-700">💬</span>}
                      {i.created_via === 'manual' && <User size={11} className="inline text-slate-400" />}
                      <span className="ml-1 text-slate-500">{i.created_via}</span>
                      {i.cleaner_session_name && <div className="text-[10px] text-slate-400">{i.cleaner_session_name}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ISSUE_STATUS_LABEL[i.status].tone}`}>
                        {ISSUE_STATUS_LABEL[i.status].en}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/beithady/inventory/issue/${i.id}`} className="text-cyan-700 hover:text-cyan-900 inline-flex items-center gap-0.5 text-[11px]">
                        Open <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Dispensing · Phase M.8 · Posting via beithady_inv_post_issue (FIFO batch picking)
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
