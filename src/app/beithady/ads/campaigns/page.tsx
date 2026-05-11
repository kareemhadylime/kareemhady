import Link from 'next/link';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listCampaigns } from '@/lib/beithady/ads/reporting';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AdsTabs } from '../_components/ads-tabs';
import { statusBadgeClass, PLATFORM_LABEL } from '@/lib/beithady/ads/platforms';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function CampaignsListPage({ searchParams }: { searchParams: Promise<{ platform?: string; status?: string }> }) {
  await requireBeithadyPermission('ads', 'read');
  const sp = await searchParams;
  const all = await listCampaigns();
  const filtered = all.filter(c => {
    if (sp.platform && c.platform !== sp.platform) return false;
    if (sp.status && (c.campaign_status || '').toUpperCase() !== sp.status.toUpperCase()) return false;
    return true;
  });

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Campaigns' }]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Campaigns"
        subtitle="Cross-platform campaign list. Click into a row for ad sets, ads, and daily metrics."
      />

      <AdsTabs active="campaigns" />

      <section className="ix-card p-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Filter</span>
        <FilterChip label="All platforms" href="/beithady/ads/campaigns" active={!sp.platform} />
        <FilterChip label="Meta" href="/beithady/ads/campaigns?platform=meta" active={sp.platform === 'meta'} />
        <FilterChip label="Google" href="/beithady/ads/campaigns?platform=google" active={sp.platform === 'google'} />
        <FilterChip label="TikTok" href="/beithady/ads/campaigns?platform=tiktok" active={sp.platform === 'tiktok'} />
        <span className="mx-2 text-slate-300">|</span>
        <FilterChip label="All status" href={`/beithady/ads/campaigns${sp.platform ? `?platform=${sp.platform}` : ''}`} active={!sp.status} />
        <FilterChip label="Active" href={`/beithady/ads/campaigns?status=ACTIVE${sp.platform ? `&platform=${sp.platform}` : ''}`} active={sp.status === 'ACTIVE'} />
        <FilterChip label="Paused" href={`/beithady/ads/campaigns?status=PAUSED${sp.platform ? `&platform=${sp.platform}` : ''}`} active={sp.status === 'PAUSED'} />
        <FilterChip label="Draft" href={`/beithady/ads/campaigns?status=DRAFT${sp.platform ? `&platform=${sp.platform}` : ''}`} active={sp.status === 'DRAFT'} />
      </section>

      <section className="ix-card p-5">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No campaigns match these filters.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">Campaign</th>
                <th className="py-2 pr-3">Platform</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Buildings</th>
                <th className="py-2 pr-3 text-right">Spend</th>
                <th className="py-2 pr-3 text-right">Clicks</th>
                <th className="py-2 pr-3 text-right">Leads</th>
                <th className="py-2 pr-3 text-right">CPL</th>
                <th className="py-2 pr-3 text-right">CTR</th>
                <th className="py-2 pr-3">Last day</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.campaign_id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                  <td className="py-2 pr-3">
                    <Link href={`/beithady/ads/campaigns/${c.campaign_id}`} className="ix-link font-medium">{c.campaign_name}</Link>
                    <div className="text-[10px] text-slate-400">{c.objective || '—'}</div>
                  </td>
                  <td className="py-2 pr-3">{PLATFORM_LABEL[c.platform as keyof typeof PLATFORM_LABEL] || c.platform}</td>
                  <td className="py-2 pr-3"><span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${statusBadgeClass(c.campaign_status)}`}>{c.campaign_status || '—'}</span></td>
                  <td className="py-2 pr-3 text-[11px]">{(c.building_codes || []).join(' · ') || '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">${Math.round(c.spend).toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c.clicks.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c.leads.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c.cpl == null ? '—' : `$${c.cpl.toFixed(2)}`}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c.ctr_pct == null ? '—' : `${c.ctr_pct.toFixed(2)}%`}</td>
                  <td className="py-2 pr-3 text-[11px] text-slate-500">{c.last_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </BeithadyShell>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-2 py-0.5 rounded ${active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
    >
      {label}
    </Link>
  );
}
