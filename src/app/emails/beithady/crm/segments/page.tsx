import Link from 'next/link';
import { Plus, ListChecks, Crown, Globe2, Plane, Users, ChevronRight, Save } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listSegmentsVisibleTo } from '@/lib/beithady/crm/segments';
import { LOYALTY_TIERS } from '@/lib/beithady/crm/loyalty';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { createSegmentAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function BeithadySegmentsPage() {
  const { user } = await requireBeithadyPermission('crm', 'read');
  const segments = await listSegmentsVisibleTo(user.id);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'CRM', href: '/emails/beithady/crm' },
      { label: 'Segments' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · CRM · Segments"
        title="Segments"
        subtitle="Saved guest filters. Used today for bulk CSV export; Phase C wires segments to broadcast WhatsApp + email."
      />

      {/* New segment form */}
      <form action={createSegmentAction} className="ix-card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Plus size={14} />
          New segment
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">Name</span>
            <input name="name" required minLength={2} maxLength={80} className="ix-input w-full" placeholder="e.g. Saudi families · Eid 2026" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">Description (optional)</span>
            <input name="description" maxLength={200} className="ix-input w-full" />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">Search</span>
            <input name="f_search" className="ix-input w-full" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">Countries (ISO, comma)</span>
            <input name="f_countries" className="ix-input w-full" placeholder="EG,SA,US" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">Min stays</span>
            <input name="f_minStays" type="number" min={0} className="ix-input w-full" />
          </label>
        </div>
        <div className="space-y-1">
          <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">Tiers</span>
          <div className="flex flex-wrap gap-3 text-xs">
            {LOYALTY_TIERS.filter(t => t.tier !== 'none').map(t => (
              <label key={t.tier} className="inline-flex items-center gap-1">
                <input type="checkbox" name="f_tiers" value={t.tier} />
                <span>{t.emoji} {t.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center text-xs">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="f_vipOnly" /> <Crown size={12} className="text-yellow-600" /> VIP only
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="f_hasFutureBooking" /> <Plane size={12} className="text-cyan-600" /> Has future booking
          </label>
          <label className="inline-flex items-center gap-2 ml-auto">
            <input type="checkbox" name="shared" /> Share with team
          </label>
          <button type="submit" className="ix-btn-primary text-xs">
            <Save size={12} /> Create segment
          </button>
        </div>
      </form>

      {/* List */}
      <section className="ix-card overflow-hidden">
        <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-700">
          {segments.length} segment{segments.length === 1 ? '' : 's'} visible to {user.username}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-900/40">
              <th className="py-2 px-3">Name</th>
              <th className="py-2 px-3">Filter summary</th>
              <th className="py-2 px-3 text-right">Members</th>
              <th className="py-2 px-3">Last run</th>
              <th className="py-2 px-3">Owner</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {segments.map(s => (
              <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 px-3">
                  <Link href={`/emails/beithady/crm/segments/${s.id}`} className="font-medium hover:underline" style={{ color: 'var(--bh-navy)' }}>
                    {s.name}
                  </Link>
                  {s.description && (
                    <div className="text-xs text-slate-500 truncate max-w-[280px]">{s.description}</div>
                  )}
                </td>
                <td className="py-2 px-3 text-xs text-slate-500">
                  {summarizeFilter(s.filter)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {s.last_member_count ?? '—'}
                </td>
                <td className="py-2 px-3 text-xs text-slate-500">
                  {s.last_executed_at ? fmtCairoDateTime(s.last_executed_at) : '—'}
                </td>
                <td className="py-2 px-3 text-xs">
                  {s.shared && (
                    <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200 mr-1">
                      shared
                    </span>
                  )}
                  <code className="text-slate-400">{s.owner_user_id?.slice(0, 8) || 'system'}</code>
                </td>
                <td className="py-2 px-3 text-right">
                  <Link href={`/emails/beithady/crm/segments/${s.id}`} className="ix-link text-xs inline-flex items-center gap-1">
                    Open <ChevronRight size={12} />
                  </Link>
                </td>
              </tr>
            ))}
            {segments.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-slate-500">
                  <ListChecks size={20} className="mx-auto mb-2 text-slate-300" />
                  No segments yet. Create one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </BeithadyShell>
  );
}

function summarizeFilter(f: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof f.search === 'string' && f.search) parts.push(`search:${f.search}`);
  if (Array.isArray(f.countries) && f.countries.length) parts.push(`country:${(f.countries as string[]).join(',')}`);
  if (Array.isArray(f.tiers) && f.tiers.length) parts.push(`tier:${(f.tiers as string[]).join(',')}`);
  if (f.vipOnly) parts.push('vip');
  if (f.hasFutureBooking) parts.push('future-booking');
  if (typeof f.minStays === 'number' && f.minStays > 0) parts.push(`stays≥${f.minStays}`);
  return parts.join(' · ') || '(empty)';
}
