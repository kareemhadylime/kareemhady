import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Warehouse, Calendar, Hash, AlertCircle, ImageIcon } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { getIssue, ISSUE_STATUS_LABEL, ISSUE_TYPE_LABEL } from '@/lib/beithady/inventory/issue';
import { IssueTransitionButtons } from '../_components/issue-transition-buttons';

export const dynamic = 'force-dynamic';

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) notFound();

  const canWrite = roles.some(r => ['admin', 'manager', 'ops', 'warehouse_manager'].includes(r));
  const canApprove = issue.required_approvers.some(r => roles.includes(r as typeof roles[number]));

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Dispensing (Issue)', href: '/beithady/inventory/issue' },
        { label: issue.issue_no },
      ]}
      containerClass="max-w-5xl"
    >
      <BeithadyHeader
        eyebrow={`Beit Hady · Inventory · Issue · ${issue.issue_no}`}
        title={issue.issue_no}
        subtitle={`${ISSUE_TYPE_LABEL[issue.type].en} · ${issue.warehouse_name} (${issue.warehouse_code})`}
      />

      <section className="ix-card p-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${ISSUE_STATUS_LABEL[issue.status].tone}`}>
              {ISSUE_STATUS_LABEL[issue.status].en}
            </span>
            <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${ISSUE_TYPE_LABEL[issue.type].tone}`}>
              {ISSUE_TYPE_LABEL[issue.type].en}
            </span>
            {issue.required_approvers.length > 0 && issue.status === 'pending_approval' && (
              <span className="text-[10px] text-amber-700">Needs: {issue.required_approvers.join(' + ')}</span>
            )}
            {issue.status === 'rejected' && issue.rejected_reason && (
              <span className="text-[10px] text-rose-700 italic">
                <AlertCircle size={10} className="inline mr-1" />{issue.rejected_reason}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 inline-flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><Warehouse size={11} /> {issue.warehouse_code}</span>
            <span className="inline-flex items-center gap-1"><Calendar size={11} /> Created {new Date(issue.created_at).toLocaleDateString('en-GB')}</span>
            <span className="inline-flex items-center gap-1">via <code className="font-mono text-[10px]">{issue.created_via}</code></span>
            {issue.posted_at && (
              <span className="inline-flex items-center gap-1 text-emerald-700"><Hash size={11} /> Posted {new Date(issue.posted_at).toLocaleString('en-GB')}</span>
            )}
            {issue.cleaner_session_name && <span className="text-slate-400">by {issue.cleaner_session_name}</span>}
          </div>
          {(issue.ref_reservation_id || issue.ref_task_id || issue.ref_owner) && (
            <div className="text-[10px] text-slate-500 font-mono">
              {issue.ref_reservation_id && <span className="mr-3">res: {issue.ref_reservation_id}</span>}
              {issue.ref_task_id && <span className="mr-3">task: {issue.ref_task_id}</span>}
              {issue.ref_owner && <span>owner: {issue.ref_owner}</span>}
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Sub-total</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--bh-navy)' }}>
            {issue.computed_total_egp > 0
              ? issue.computed_total_egp.toLocaleString('en-US', { maximumFractionDigits: 2 })
              : (issue.sub_total_egp > 0 ? issue.sub_total_egp.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—')}
            <span className="text-sm text-slate-500 ml-1">EGP</span>
          </div>
          {issue.status !== 'posted' && <div className="text-[9px] text-slate-400">(actual cost set on posting via FIFO)</div>}
        </div>
      </section>

      {issue.photo_url && (
        <section className="ix-card p-3 inline-flex items-center gap-2 text-xs">
          <ImageIcon size={14} className="text-slate-400" />
          <a href={issue.photo_url} target="_blank" rel="noreferrer" className="text-cyan-700 hover:underline">View attached photo</a>
        </section>
      )}

      <section className="ix-card overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
          <h3 className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Lines ({issue.lines.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-3 py-1.5 w-10">#</th>
                <th className="text-left px-3 py-1.5">Item</th>
                <th className="text-right px-3 py-1.5">Qty</th>
                <th className="text-left px-3 py-1.5">Batch picked</th>
                <th className="text-right px-3 py-1.5">Unit cost (EGP)</th>
                <th className="text-right px-3 py-1.5">Total (EGP)</th>
                <th className="text-left px-3 py-1.5">Note</th>
              </tr>
            </thead>
            <tbody>
              {issue.lines.map(l => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 text-slate-400 tabular-nums">{l.line_no}</td>
                  <td className="px-3 py-1.5">
                    <div className="font-mono text-[11px]">{l.item_sku}</div>
                    <div className="text-[10px] text-slate-500">{l.item_name_en}</div>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.qty} {l.item_uom}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">
                    {l.batch_no_picked === '__bulk__' ? <span className="italic">FIFO</span> : l.batch_no_picked}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {Number(l.unit_cost_egp || 0) > 0 ? Number(l.unit_cost_egp).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                    {(Number(l.qty) * Number(l.unit_cost_egp || 0)).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-1.5 text-[10px] text-slate-500 italic">{l.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canWrite && (
        <IssueTransitionButtons
          issueId={issue.id}
          status={issue.status}
          requiredApprovers={issue.required_approvers}
          canApprove={canApprove}
        />
      )}

      {issue.notes && (
        <section className="ix-card p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">Notes</div>
          <div className="text-xs text-slate-700 whitespace-pre-wrap">{issue.notes}</div>
        </section>
      )}

      <Link href="/beithady/inventory/issue" className="text-xs text-cyan-700 hover:underline inline-flex items-center gap-1">
        <ChevronLeft size={12} /> Back to issues
      </Link>
    </BeithadyShell>
  );
}
