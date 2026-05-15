// src/app/api/cron/youtube-stats-sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getYouTubeAccessToken } from '@/lib/beithady/youtube/youtube-client';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function isCronAuthed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

type Row = { id: number; account_id: number; youtube_video_id: string };

export async function GET(req: NextRequest) {
  if (!isCronAuthed(req)) return new Response('unauthorized', { status: 401 });

  const sb = supabaseAdmin();
  const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data, error } = await sb
    .from('ads_youtube_videos')
    .select('id, account_id, youtube_video_id')
    .eq('status', 'published')
    .not('youtube_video_id', 'is', null)
    .or(`stats_synced_at.is.null,stats_synced_at.lte.${sixHoursAgo}`)
    .order('stats_synced_at', { ascending: true, nullsFirst: true })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data as Row[] | null) || [];
  if (rows.length === 0) return NextResponse.json({ updated: 0 });

  // Group by account so we can refresh the right access token per batch
  const byAccount = new Map<number, Row[]>();
  for (const r of rows) {
    if (!byAccount.has(r.account_id)) byAccount.set(r.account_id, []);
    byAccount.get(r.account_id)!.push(r);
  }

  let updated = 0;
  for (const [accountId, list] of byAccount) {
    const accessToken = await getYouTubeAccessToken(accountId);
    for (let i = 0; i < list.length; i += 50) {
      const batch = list.slice(i, i + 50);
      const ids = batch.map(r => r.youtube_video_id).join(',');
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(ids)}&part=statistics`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) continue;
      const json = await res.json() as {
        items?: Array<{ id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>;
      };
      const now = new Date().toISOString();
      for (const item of json.items ?? []) {
        const stats = item.statistics ?? {};
        await sb.from('ads_youtube_videos').update({
          view_count: Number(stats.viewCount ?? 0),
          like_count: Number(stats.likeCount ?? 0),
          comment_count: Number(stats.commentCount ?? 0),
          stats_synced_at: now,
        }).eq('youtube_video_id', item.id);
        updated++;
      }
    }
  }

  return NextResponse.json({ updated });
}
