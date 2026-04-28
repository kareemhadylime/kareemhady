import Link from 'next/link';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listAtRiskReservations } from '@/lib/beithady/operations/cancel-risk';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { ReconfirmButton } from './_reconfirm-button';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SIGNAL_LABELS: Record<string, string> = {
  inquiry_status: 'Inquiry status',
  lead_time: 'Long lead time',
  unpaid_imminent: 'Unpaid + arriving ≤7d',
  unpaid: 'Unpaid',
  partial_payment: 'Partial payment',
  channel_booking: 'Booking.com cancel rate',
  channel_direct: 'Direct/manual booking',
  first_time: 'First-time guest',
  returning: 'Returning guest (lower risk)',
  silence: 'Communication silence',
  reconfirmation_recent: 'Re-confirmation sent (lower risk)',
};

export default async function CancelRiskPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string; days?: string }>;
}) {
  await requireBeithadyPermission('operations', 'read');
  const sp = await searchParams;
  const minScore = Number(sp.min ?? 50);
  const daysAhead = Number(sp.days ?? 21);

  const rows = await listAtRiskReservations({ minScore, maxDaysAhead: daysAhead });

  const critical = rows.filter(r => r.cancel_risk_score >= 70);
  const high = rows.filter(r => r.cancel_risk_score >= 50 && r.cancel_risk_score < 70);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Operations', href: '/beithady/operations' },
      { label: 'Cancel-risk' },
    ]} containerClass="max-w-6xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Operations"
        title="At-risk reservations"
        subtitle={`${rows.length} bookings with cancel-risk ≥ ${minScore} arriving in the next ${daysAhead} days. Sorted by risk score.`}
      />

      {/* Filter strip */}
      <section className="ix-card p-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Min score:</span>
        {[30, 50, 70].map(s => (
          <Link
            key={s}
            href={`?min=${s}&days=${daysAhead}`}
            className={`px-3 py-1 rounded-full
              ${minScore === s
                ? 'bg-rose-600 text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}
          >
            ≥ {s}
          </Link>
        ))}
        <span className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Window:</span>
        {[7, 14, 21, 30].map(d => (
          <Link
            key={d}
            href={`?min=${minScore}&days=${d}`}
            className={`px-3 py-1 rounded-full
              ${daysAhead === d
                ? 'bg-[var(--bh-navy)] text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}
          >
            {d}d
          </Link>
        ))}
      </section>

      {/* Counts */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Critical (70+)" value={critical.length} tone="red" />
        <Stat label="High (50-69)" value={high.length} tone="amber" />
        <Stat label="Avg score" value={rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.cancel_risk_score, 0) / rows.length) : 0} tone="slate" />
        <Stat label="Re-confirmed (last 7d)" value={rows.filter(r => r.last_reconfirmation_sent_at && new Date(r.last_reconfirmation_sent_at) > new Date(Date.now() - 7 * 86400000)).length} tone="emerald" />
      </section>

      {rows.length === 0 ? (
        <div className="ix-card p-10 text-center text-sm text-slate-500">
          <AlertTriangle size={28} className="mx-auto mb-2 text-slate-300" />
          No at-risk reservations matching your filters.
        </div>
      ) : (
        <div className="ix-card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left p-2">Score</th>
                <th className="text-left p-2">Check-in</th>
                <th className="text-left p-2">Listing</th>
                <th className="text-left p-2">Guest</th>
                <th className="text-left p-2">Channel</th>
                <th className="text-left p-2">Signals</th>
                <th className="text-right p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.reservation_id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="p-2">
                    <ScorePill score={r.cancel_risk_score} />
                  </td>
                  <td className="p-2 tabular-nums">
                    {r.check_in_date}
                    <div className="text-[10px] text-slate-400">{r.nights}n</div>
                  </td>
                  <td className="p-2">
                    <Link
                      href={`/beithady/operations/calendar?reservation=${r.reservation_id}`}
                      className="text-cyan-700 dark:text-cyan-300 hover:underline inline-flex items-center gap-0.5"
                    >
                      {r.listing_nickname || r.listing_id} <ExternalLink size={10} />
                    </Link>
                    {r.building_code && <div className="text-[10px] text-slate-400">{r.building_code}</div>}
                  </td>
                  <td className="p-2">
                    {r.guest_name || '—'}
                    {(r.is_vip || ['platinum', 'gold', 'vip'].includes((r.loyalty_tier || '').toLowerCase())) && (
                      <span className="ml-1 text-violet-600">★</span>
                    )}
                    {r.guest_phone && <div className="text-[10px] text-slate-400">{r.guest_phone}</div>}
                  </td>
                  <td className="p-2 text-slate-600 dark:text-slate-400">{r.channel || '—'}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(r.cancel_risk_breakdown || {}).map(([k, v]) => (
                        <span
                          key={k}
                          className={`text-[9px] px-1.5 py-px rounded ${
                            (v as number) > 0
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                          }`}
                          title={`${SIGNAL_LABELS[k] || k}: ${v}`}
                        >
                          {SIGNAL_LABELS[k] || k} {v as number > 0 ? '+' : ''}{v as number}
                        </span>
                      ))}
                    </div>
                    {r.last_reconfirmation_sent_at && (
                      <div className="text-[10px] text-emerald-600 mt-0.5">
                        Re-confirmed {timeAgo(r.last_reconfirmation_sent_at)}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <ReconfirmButton
                      reservationId={r.reservation_id}
                      hasPhone={Boolean(r.guest_phone)}
                      recentlySent={Boolean(r.last_reconfirmation_sent_at &&
                        new Date(r.last_reconfirmation_sent_at) > new Date(Date.now() - 24 * 3600 * 1000))}
                    />
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

function Stat({ label, value, tone }: { label: string; value: number; tone: 'red' | 'amber' | 'emerald' | 'slate' }) {
  const cls = tone === 'red' ? 'text-rose-700 dark:text-rose-300'
    : tone === 'amber' ? 'text-amber-700 dark:text-amber-300'
    : tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const cls = score >= 70
    ? 'bg-rose-600 text-white'
    : score >= 50
      ? 'bg-amber-500 text-white'
      : score >= 30
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200';
  return (
    <span className={`inline-block px-2 py-0.5 rounded font-bold tabular-nums text-[11px] ${cls}`}>
      {score}
    </span>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.round(ms / 3600000);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
