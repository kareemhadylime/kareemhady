// src/app/beithady/gallery/youtube/page.tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Video as YouTubeIcon } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { YOUTUBE_TEMPLATES } from '@/lib/beithady/youtube/templates';
import { PublishForm } from './_components/publish-form';
import { RecentUploadsTable } from './_components/recent-uploads-table';
import { generateMetadataAction, publishYouTubeVideoAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type AssetRow = {
  id: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  size_bytes: number;
  duration_sec: number | null;
  building_code: string | null;
  mime_type: string;
};

type AccountRow = {
  id: number;
  youtube_channel_handle: string | null;
  youtube_channel_name: string | null;
  youtube_refresh_token: string | null;
};

export default async function YouTubePublishPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; published?: string; queued?: string; asset?: string }>;
}) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();

  const [{ data: accountsRaw }, { data: assetsRaw }, { data: rowsRaw }] = await Promise.all([
    sb.from('ads_accounts').select('id, youtube_channel_handle, youtube_channel_name, youtube_refresh_token').eq('platform', 'youtube').order('id').limit(1),
    sb.from('beithady_gallery_assets').select('id, file_name, storage_bucket, storage_path, size_bytes, duration_sec, building_code, mime_type').like('mime_type', 'video/%').is('deleted_at', null).order('created_at', { ascending: false }).limit(100),
    sb.from('ads_youtube_videos').select('id, title, status, is_shorts, duration_seconds, privacy_status, view_count, like_count, comment_count, watch_url, error, created_at, next_retry_at').order('created_at', { ascending: false }).limit(25),
  ]);

  const accounts = (accountsRaw as AccountRow[] | null) ?? [];
  const account = accounts[0];
  if (!account || !account.youtube_refresh_token) {
    redirect('/beithady/ads/accounts?need_connect=youtube');
  }

  const assets = (assetsRaw as AssetRow[] | null) ?? [];

  // Sign URLs for the picker (1h TTL). Use the existing helper which routes
  // to the right private bucket based on storage_bucket per row.
  const { signedUrlFor } = await import('@/lib/beithady/gallery/storage');
  const galleryOptions = await Promise.all(assets.map(async a => {
    const signed = await signedUrlFor(a.storage_bucket as 'beithady-gallery' | 'beithady-gallery-public' | 'beithady-documents', a.storage_path, 3600);
    return {
      id: a.id,
      file_name: a.file_name,
      signed_url: signed ?? '',
      size_bytes: a.size_bytes,
      duration_sec: a.duration_sec,
      building_code: a.building_code,
    };
  })).then(list => list.filter(o => o.signed_url));

  const templates = YOUTUBE_TEMPLATES.map(t => ({
    id: t.id,
    label: t.label,
    applies_to: t.applies_to,
    building_code: t.building_code,
    default_privacy: t.default_privacy,
    default_language: t.default_language,
  }));

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Gallery', href: '/beithady/gallery' }, { label: 'YouTube' }]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Gallery · YouTube"
        title="Publish to YouTube"
        subtitle={`Channel: ${account.youtube_channel_handle ?? account.youtube_channel_name ?? '@beithady'}`}
      />

      {sp.error && <div className="ix-card border-rose-200 bg-rose-50 p-3 text-sm font-mono">{sp.error}</div>}
      {sp.published && (
        <div className="ix-card border-emerald-200 bg-emerald-50 p-3 text-sm">
          ✅ Submitted upload <code>#{sp.published}</code> — YouTube is processing. Watch URL will appear in Recent uploads.
        </div>
      )}
      {sp.queued && (
        <div className="ix-card border-blue-200 bg-blue-50 p-3 text-sm">
          ⏳ Queued upload <code>#{sp.queued}</code> — async path (long-form). Cron will upload in chunks.
        </div>
      )}

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <YouTubeIcon size={14} className="text-rose-600" />
          New upload
        </h2>
        <PublishForm
          accountId={account.id}
          templates={templates}
          galleryOptions={galleryOptions}
          initialAssetId={sp.asset ?? null}
          generateAction={generateMetadataAction}
          publishAction={publishYouTubeVideoAction}
        />
      </section>

      <section className="ix-card p-3 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-sm">Cross-post to Meta / TikTok / Google</h3>
          <p className="text-xs text-slate-500">Pick a published YouTube video and send it across all your ad channels.</p>
        </div>
        <Link href="/beithady/gallery/youtube/picker" className="ix-btn-primary text-sm">
          Open picker →
        </Link>
      </section>

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Recent uploads</h2>
        <RecentUploadsTable rows={(rowsRaw as Parameters<typeof RecentUploadsTable>[0]['rows'] | null) ?? []} />
      </section>
    </BeithadyShell>
  );
}
