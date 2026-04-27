import { History } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { queryAudit } from '@/lib/beithady/audit';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';

const MODULE_BADGES: Record<string, string> = {
  foundation: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  crm: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
  communication: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200',
  gallery: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200',
  ads: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  settings: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
};

export default async function BeithadyAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; limit?: string }>;
}) {
  await requireBeithadyPermission('settings', 'read');
  const sp = await searchParams;
  const mod = sp.module && ['foundation','crm','communication','gallery','ads','settings'].includes(sp.module)
    ? (sp.module as 'foundation' | 'crm' | 'communication' | 'gallery' | 'ads' | 'settings')
    : undefined;
  const limit = Math.min(500, Math.max(20, Number(sp.limit) || 100));

  const rows = await queryAudit({ module: mod, limit });

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Settings', href: '/emails/beithady/settings' },
      { label: 'Audit log' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Settings · Audit"
        title="Audit log"
        subtitle="Chronological log of role grants, settings changes, and (in later phases) every CRM edit, message, ad publish, and asset upload."
        right={
          <form className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              Module
              <select name="module" defaultValue={mod || ''} className="ix-input text-xs">
                <option value="">All</option>
                <option value="foundation">foundation</option>
                <option value="settings">settings</option>
                <option value="crm">crm</option>
                <option value="communication">communication</option>
                <option value="gallery">gallery</option>
                <option value="ads">ads</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              Limit
              <select name="limit" defaultValue={String(limit)} className="ix-input text-xs">
                <option>50</option>
                <option>100</option>
                <option>250</option>
                <option>500</option>
              </select>
            </label>
            <button type="submit" className="ix-btn-secondary text-xs">Filter</button>
          </form>
        }
      />

      <div className="ix-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200 dark:border-slate-700">
              <th className="py-2 px-4">When</th>
              <th className="py-2 px-4">Actor</th>
              <th className="py-2 px-4">Module</th>
              <th className="py-2 px-4">Action</th>
              <th className="py-2 px-4">Target</th>
              <th className="py-2 px-4">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 align-top">
                <td className="py-2 px-4 text-xs text-slate-500 whitespace-nowrap">
                  {fmtCairoDateTime(r.created_at)}
                </td>
                <td className="py-2 px-4 text-xs">
                  <code>{r.actor_user_id?.slice(0, 8) || 'system'}</code>
                </td>
                <td className="py-2 px-4">
                  <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${MODULE_BADGES[r.module] || 'bg-slate-100 text-slate-700'}`}>
                    {r.module}
                  </span>
                </td>
                <td className="py-2 px-4 text-xs font-medium">{r.action}</td>
                <td className="py-2 px-4 text-xs">
                  {r.target_type ? (
                    <span>
                      {r.target_type}
                      {r.target_id ? <code className="ml-1 text-slate-400">{r.target_id.slice(0, 8)}</code> : null}
                    </span>
                  ) : '—'}
                </td>
                <td className="py-2 px-4 text-[11px] text-slate-500 max-w-[400px] truncate">
                  {r.metadata ? JSON.stringify(r.metadata) : (r.after ? JSON.stringify(r.after) : '')}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-slate-500">
                  <History size={20} className="mx-auto mb-2 text-slate-300" />
                  No audit events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </BeithadyShell>
  );
}
