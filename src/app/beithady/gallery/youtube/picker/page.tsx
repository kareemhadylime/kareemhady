import { redirect } from 'next/navigation';
import { Video as YouTubeIcon } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { listPickerVideos } from '@/lib/beithady/youtube/picker';
import { PickerFilters } from './_components/picker-filters';
import { PickerGrid } from './_components/picker-grid';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type AccountRow = {
  id: number;
  youtube_channel_handle: string | null;
  youtube_channel_name: string | null;
};

export default async function YouTubePickerPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string; building?: string; search?: string; sort?: string }>;
}) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const { data: accountsRaw } = await sb.from('ads_accounts')
    .select('id, youtube_channel_handle, youtube_channel_name')
    .eq('platform', 'youtube').limit(1);
  const account = (accountsRaw as AccountRow[] | null)?.[0];
  if (!account) redirect('/beithady/ads/accounts?need_connect=youtube');

  const items = await listPickerVideos(account.id, {
    building_code: sp.building && sp.building !== 'all' ? sp.building : null,
    format: (sp.format as 'shorts' | 'longform' | 'all') ?? 'all',
    search: sp.search,
    sort: (sp.sort as 'recent' | 'views' | 'likes') ?? 'recent',
  });

  const buildings = ['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-34'];

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Gallery', href: '/beithady/gallery' },
      { label: 'YouTube', href: '/beithady/gallery/youtube' },
      { label: 'Picker' },
    ]} containerClass="max-w-6xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Gallery · YouTube"
        title="Cross-post picker"
        subtitle={`Channel: ${account.youtube_channel_handle ?? account.youtube_channel_name ?? '@beithady'} · ${items.length} video${items.length === 1 ? '' : 's'}`}
        right={<div className="text-rose-600"><YouTubeIcon size={18} /></div>}
      />

      <section className="ix-card p-3">
        <PickerFilters buildings={buildings} />
      </section>

      <PickerGrid items={items} />
    </BeithadyShell>
  );
}
