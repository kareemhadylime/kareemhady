import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Crown, Download, Users } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { executeSegment } from '@/lib/beithady/crm/segments';
import { tierConfig } from '@/lib/beithady/crm/loyalty';
import { flagFor } from '@/lib/beithady/crm/guest-list';
import { fmtCairoDate } from '@/lib/fmt-date';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(n);
}

export default async function BeithadySegmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ segmentId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireBeithadyPermission('crm', 'read');
  const { segmentId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const pageSize = 50;

  const { segment, result } = await executeSegment(segmentId, { page, pageSize });
  if (!segment) notFound();

  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));

  const csvParams = new URLSearchParams();
  const f = segment.filter as Record<string, unknown>;
  if (typeof f.search === 'string') csvParams.set('q', f.search);
  if (Array.isArray(f.countries)) csvParams.set('country', (f.countries as string[]).join(','));
  if (Array.isArray(f.tiers)) (f.tiers as string[]).forEach(t => csvParams.append('tier', t));
  if (f.vipOnly) csvParams.set('vip', '1');
  if (f.hasFutureBooking) csvParams.set('future', '1');
  if (typeof f.minStays === 'number' && f.minStays > 0) csvParams.set('minStays', String(f.minStays));

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'CRM', href: '/emails/beithady/crm' },
        { label: 'Segments', href: '/emails/beithady/crm/segments' },
        { label: segment.name },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · CRM · Segment"
        title={segment.name}
        subtitle={segment.description || `${result.total} member${result.total === 1 ? '' : 's'} matching the filter`}
        right={
          <a
            href={`/api/beithady/crm/export-csv?${csvParams.toString()}`}
            className="ix-btn-secondary text-xs"
          >
            <Download size={12} /> Download CSV
          </a>
        }
      />

      <div className="ix-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-900/40">
              <th className="py-2 px-3">Guest</th>
              <th className="py-2 px-3">Country</th>
              <th className="py-2 px-3 text-right">Stays</th>
              <th className="py-2 px-3 text-right">Spend USD</th>
              <th className="py-2 px-3">Tier</th>
              <th className="py-2 px-3">Last seen</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map(g => {
              const tier = tierConfig(g.loyalty_tier);
              return (
                <tr key={g.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 px-3">
                    <Link href={`/emails/beithady/crm/${g.id}`} className="font-medium hover:underline" style={{ color: 'var(--bh-navy)' }}>
                      {g.full_name || '(unnamed)'}
                    </Link>
                    <div className="text-xs text-slate-500 truncate max-w-[260px]">{g.email || g.phone_e164 || '—'}</div>
                    {g.vip && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 mt-1">
                        <Crown size={10} /> VIP
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <span className="text-base">{flagFor(g.residence_country)}</span>{' '}
                    <span className="text-xs text-slate-500">{g.residence_country || '—'}</span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{g.lifetime_stays}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtMoney(g.lifetime_spend_usd)}</td>
                  <td className="py-2 px-3">
                    <span
                      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: tier.display_color + '22', color: tier.display_color }}
                    >
                      {tier.emoji} {tier.label}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-500">{g.last_seen ? fmtCairoDate(g.last_seen) : '—'}</td>
                  <td className="py-2 px-3 text-right">
                    <Link href={`/emails/beithady/crm/${g.id}`} className="ix-link text-xs inline-flex items-center gap-1">
                      Open <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm text-slate-500">
                  <Users size={20} className="mx-auto mb-2 text-slate-300" />
                  No guests match this segment yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <Link
              href={`?page=${Math.max(1, page - 1)}`}
              className={`ix-btn-secondary text-xs ${page <= 1 ? 'opacity-40 pointer-events-none' : ''}`}
            >
              Prev
            </Link>
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </span>
            <Link
              href={`?page=${Math.min(totalPages, page + 1)}`}
              className={`ix-btn-secondary text-xs ${page >= totalPages ? 'opacity-40 pointer-events-none' : ''}`}
            >
              Next
            </Link>
          </div>
        )}
      </div>
    </BeithadyShell>
  );
}
