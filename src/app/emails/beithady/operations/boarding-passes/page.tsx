import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';

type BoardingPassRow = {
  id: string;
  reservation_id: string | null;
  building_code: string | null;
  listing_id: string | null;
  token: string | null;
  expires_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  view_count: number | null;
  created_at: string;
};

async function getRecentBoardingPasses(): Promise<BoardingPassRow[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_boarding_passes')
    .select('id, reservation_id, building_code, listing_id, token, expires_at, sent_at, viewed_at, view_count, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  return (data as BoardingPassRow[] | null) || [];
}

export default async function BoardingPassesLanding() {
  await requireBeithadyPermission('operations', 'read');
  const rows = await getRecentBoardingPasses();
  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Operations', href: '/emails/beithady/operations' },
      { label: 'Boarding Passes' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Operations"
        title="Boarding Passes"
        subtitle={`${rows.length} most recent passes. Pre-arrival message log + view counts.`}
      />
      {rows.length === 0 ? (
        <div className="ix-card p-10 text-center text-sm text-slate-500">
          <Ticket size={28} className="mx-auto mb-3 text-slate-300" />
          No boarding passes yet.
        </div>
      ) : (
        <div className="ix-card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left p-3">Building</th>
                <th className="text-left p-3">Reservation</th>
                <th className="text-left p-3">Sent</th>
                <th className="text-left p-3">Viewed</th>
                <th className="text-right p-3">Views</th>
                <th className="text-left p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="p-3 font-medium">{r.building_code || '—'}</td>
                  <td className="p-3 font-mono text-[11px]">{r.reservation_id || '—'}</td>
                  <td className="p-3">{r.sent_at ? new Date(r.sent_at).toLocaleString() : '—'}</td>
                  <td className="p-3">{r.viewed_at ? new Date(r.viewed_at).toLocaleString() : <span className="text-slate-400">not yet</span>}</td>
                  <td className="p-3 text-right tabular-nums">{r.view_count ?? 0}</td>
                  <td className="p-3 text-right">
                    {r.token && (
                      <Link
                        href={`/boarding/${r.token}`}
                        className="text-[var(--bh-navy)] hover:underline text-[11px]"
                        target="_blank"
                      >
                        Open
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </BeithadyShell>
  );
}
