import Link from 'next/link';
import { Users, ChevronLeft, ExternalLink } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listLeadFunnel } from '@/lib/beithady/ads/reporting';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { flagFor, countryName } from '@/lib/beithady/market/countries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function AdsLeadsPage({ searchParams }: { searchParams: Promise<{ stage?: 'new' | 'processed' | 'booked' }> }) {
  await requireBeithadyPermission('ads', 'read');
  const sp = await searchParams;
  const stage = sp.stage;

  const rows = await listLeadFunnel({ stage, limit: 200 });

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Ads', href: '/emails/beithady/ads' },
      { label: 'Leads' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads · Leads"
        title="Lead funnel"
        subtitle="Click-to-WhatsApp leads with attribution. The 90-day phone-match trigger links a lead to a Guesty booking automatically."
        right={
          <Link href="/emails/beithady/ads" className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> Ads dashboard
          </Link>
        }
      />

      <div className="flex items-center gap-2 text-xs">
        <Link href="/emails/beithady/ads/leads" className={`px-3 py-1 rounded ${!stage ? 'bg-slate-700 text-white' : 'bg-stone-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>All</Link>
        <Link href="?stage=new" className={`px-3 py-1 rounded ${stage === 'new' ? 'bg-slate-700 text-white' : 'bg-stone-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>New</Link>
        <Link href="?stage=processed" className={`px-3 py-1 rounded ${stage === 'processed' ? 'bg-slate-700 text-white' : 'bg-stone-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>Processed</Link>
        <Link href="?stage=booked" className={`px-3 py-1 rounded ${stage === 'booked' ? 'bg-slate-700 text-white' : 'bg-stone-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>Booked</Link>
      </div>

      <div className="ix-card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <Users size={20} className="mx-auto mb-2 text-slate-300" />
            No leads {stage ? `at "${stage}" stage` : 'yet'}. Leads land here via the Meta lead webhook + CTWA conversation auto-greet.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 px-4">When</th>
                <th className="py-2 px-4">Lead</th>
                <th className="py-2 px-4">Country</th>
                <th className="py-2 px-4">Campaign</th>
                <th className="py-2 px-4">Buildings</th>
                <th className="py-2 px-4">Stage</th>
                <th className="py-2 px-4 text-right">Booking value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.lead_id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                  <td className="py-2 px-4 whitespace-nowrap text-[11px] text-slate-500">{fmtCairoDateTime(l.created_at)}</td>
                  <td className="py-2 px-4">
                    <div className="font-medium">{l.full_name || l.phone_e164 || l.email || '—'}</div>
                    <div className="text-[10px] text-slate-500 inline-flex items-center gap-2">
                      {l.phone_e164 && <span>{l.phone_e164}</span>}
                      {l.email && <span>· {l.email}</span>}
                      {l.beithady_guest_id && (
                        <Link href={`/emails/beithady/crm/${l.beithady_guest_id}`} className="ix-link inline-flex items-center gap-1">
                          CRM <ExternalLink size={9} />
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-4 text-[11px]">
                    {l.country ? `${flagFor(l.country)} ${countryName(l.country)}` : '—'}
                  </td>
                  <td className="py-2 px-4 text-[11px]">
                    {l.campaign_id ? (
                      <Link href={`/emails/beithady/ads/campaigns/${l.campaign_id}`} className="ix-link">{l.campaign_name || `#${l.campaign_id}`}</Link>
                    ) : '—'}
                  </td>
                  <td className="py-2 px-4 text-[11px]">{(l.building_codes || []).join(' · ') || '—'}</td>
                  <td className="py-2 px-4">
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
                      l.funnel_stage === 'booked' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200' :
                      l.funnel_stage === 'processed' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}>
                      {l.funnel_stage}
                    </span>
                    {l.matched_at && (
                      <div className="text-[9px] text-slate-400 mt-0.5">matched {fmtCairoDateTime(l.matched_at)}</div>
                    )}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums">
                    {l.booking_value ? `${l.booking_currency || 'USD'} ${Math.round(l.booking_value).toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-slate-500 text-center">
        Attribution: phone E.164 match within 90 days of lead arrival. Trigger fires on every guesty_reservations insert/update.
      </p>
    </BeithadyShell>
  );
}
