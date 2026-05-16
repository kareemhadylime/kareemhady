import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AdsTabs } from '../_components/ads-tabs';
import { DateRangeFilter } from '../_components/date-range-filter';
import { parseDateRange } from '@/lib/beithady/ads/date-range';
import { AudienceFilters } from './_components/audience-filters';
import { GeoTab } from './_components/geo-tab';
import { DemoTab } from './_components/demo-tab';
import { DeviceTab } from './_components/device-tab';
import { FunnelTab } from './_components/funnel-tab';
import { QualityTab } from './_components/quality-tab';
import { CohortTab } from './_components/cohort-tab';
import { PerBuildingFilter } from '../_components/per-building-filter';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TABS: Array<{ key: 'geo' | 'demo' | 'device' | 'funnel' | 'quality' | 'cohort'; label: string }> = [
  { key: 'geo', label: 'Geo' },
  { key: 'demo', label: 'Demographics' },
  { key: 'device', label: 'Device & Placement' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'quality', label: 'Quality' },
  { key: 'cohort', label: 'Cohort' },
];

const ACTIVE = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
const INACTIVE = 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400';

export default async function AdsAudiencePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string; from?: string; to?: string; preset?: string; compare?: string;
    campaign?: string; platforms?: string; building?: string;
  }>;
}) {
  await requireBeithadyPermission('ads', 'read');
  const sp = await searchParams;
  const range = parseDateRange({ from: sp.from, to: sp.to, preset: sp.preset, compare: sp.compare });
  const tab = (sp.tab as 'geo' | 'demo' | 'device' | 'funnel' | 'quality' | 'cohort') ?? 'geo';
  const campaignId = sp.campaign ? Number(sp.campaign) : undefined;
  const platforms = (sp.platforms ?? '').split(',').filter(Boolean) as Array<'meta' | 'google' | 'tiktok'>;
  const buildingCode = sp.building || undefined;

  const sb = supabaseAdmin();
  const { data: campaignRows } = await sb.from('ads_campaigns')
    .select('id, name, platform').neq('status', 'REMOVED').order('name');
  const campaigns = ((campaignRows as Array<{ id: number; name: string; platform: 'meta' | 'google' | 'tiktok' }> | null) ?? []);

  const baseQs = new URLSearchParams();
  if (sp.from) baseQs.set('from', sp.from);
  if (sp.to) baseQs.set('to', sp.to);
  if (sp.preset) baseQs.set('preset', sp.preset);
  if (sp.compare) baseQs.set('compare', sp.compare);
  if (sp.campaign) baseQs.set('campaign', sp.campaign);
  if (sp.platforms) baseQs.set('platforms', sp.platforms);
  if (sp.building) baseQs.set('building', sp.building);

  function tabHref(key: string): string {
    const q = new URLSearchParams(baseQs);
    q.set('tab', key);
    return `/beithady/ads/audience?${q.toString()}`;
  }

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Audience' }]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Audience"
        subtitle="Where impressions, clicks, and leads come from — geo, demographics, device & placement."
      />
      <AdsTabs active="audience" />
      <DateRangeFilter />
      <AudienceFilters campaigns={campaigns} />
      <PerBuildingFilter />
      <div className="ix-card p-2 flex flex-wrap items-center gap-2 text-xs">
        {TABS.map(t => (
          <Link key={t.key} href={tabHref(t.key)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${tab === t.key ? ACTIVE : INACTIVE}`}>
            {t.label}
          </Link>
        ))}
      </div>
      {tab === 'geo' && <GeoTab range={range} campaignId={campaignId} platforms={platforms} buildingCode={buildingCode} />}
      {tab === 'demo' && <DemoTab range={range} campaignId={campaignId} platforms={platforms} buildingCode={buildingCode} />}
      {tab === 'device' && <DeviceTab range={range} campaignId={campaignId} platforms={platforms} buildingCode={buildingCode} />}
      {tab === 'funnel' && <FunnelTab range={range} campaignId={campaignId} buildingCode={buildingCode} />}
      {tab === 'quality' && <QualityTab range={range} campaignId={campaignId} platforms={platforms} buildingCode={buildingCode} />}
      {tab === 'cohort' && <CohortTab range={range} campaignId={campaignId} platforms={platforms} buildingCode={buildingCode} />}
    </BeithadyShell>
  );
}
