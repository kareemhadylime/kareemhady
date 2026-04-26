import 'server-only';
import { supabaseAdmin } from '../supabase';
import type { ReportPeriodWindow } from './cairo-dates';

// Conversations metrics for v2 daily report:
//   - Avg response time (24/7 wall clock per Q4=A)
//   - First-response time (S7) — first host reply per inquiry
//   - Total guest-message count
//   - Worst-2 agents by avg response time (Q5=A) — per-agent ranking
//   - SLA buckets <1h / 1-4h / 4-24h / >24h (S3)
//
// Implementation: walk guesty_conversation_posts in two windows
// (Yesterday = full day, MTD = month-start through yesterday).
// For each conversation, compute response gaps as: when a guest post
// is followed by a host post, response_time = host.created - guest.created.
// Consecutive same-author posts collapse (R2 of v2 plan).

export type ConversationsSection = {
  yesterday: {
    avg_response_minutes: number;
    first_response_avg_minutes: number;
    guest_message_count: number;
    sample_size: number;
  };
  mtd: {
    avg_response_minutes: number;
    first_response_avg_minutes: number;
    guest_message_count: number;
    sample_size: number;
  };
  worst_2_agents: Array<{
    agent_name: string;
    avg_response_minutes: number;
    sample_size: number;
    slow_threads: Array<{
      conversation_id: string;
      subject: string | null;
      minutes: number;
      created_at: string;
    }>;
  }>;
  sla_buckets_yesterday: { bucket: '<1h' | '1-4h' | '4-24h' | '>24h'; count: number }[];
};

type PostRow = {
  id: string;
  conversation_id: string;
  sent_by: string | null;
  from_full_name: string | null;
  is_automatic: boolean | null;
  module_subject: string | null;
  created_at_guesty: string;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function buildConversationsSection(
  ctx: ReportPeriodWindow
): Promise<{ section: ConversationsSection; warnings: string[] }> {
  const sb = supabaseAdmin();
  const warnings: string[] = [];

  // Pull posts within MTD-ish window. Cap at first 30k to stay safe.
  const { data, error } = await sb
    .from('guesty_conversation_posts')
    .select(
      'id, conversation_id, sent_by, from_full_name, is_automatic, module_subject, created_at_guesty'
    )
    .gte('created_at_guesty', ctx.mtd_start + 'T00:00:00Z')
    .lte('created_at_guesty', ctx.period_end_iso)
    .order('conversation_id', { ascending: true })
    .order('created_at_guesty', { ascending: true })
    .limit(30000);

  if (error) {
    warnings.push(`conv_posts_query_failed: ${error.message}`);
    return { section: emptyConversationsSection(), warnings };
  }

  const posts = (data as PostRow[] | null) || [];

  // Group posts by conversation, in chronological order.
  const byConv = new Map<string, PostRow[]>();
  for (const p of posts) {
    const arr = byConv.get(p.conversation_id) || [];
    arr.push(p);
    byConv.set(p.conversation_id, arr);
  }

  // Walk each conversation; compute guest→host response gaps.
  type Gap = {
    conversation_id: string;
    agent: string;
    minutes: number;
    created_at: string;
    subject: string | null;
    is_first_response: boolean;
  };
  const gaps: Gap[] = [];
  let guestMsgCountMtd = 0;
  let guestMsgCountYesterday = 0;

  for (const [convId, list] of byConv.entries()) {
    let pendingGuestAt: string | null = null;
    let pendingGuestSubject: string | null = null;
    let firstResponseSeen = false;

    for (const p of list) {
      const isHost = p.sent_by === 'host';
      const isGuest = p.sent_by === 'guest';

      if (isGuest) {
        if (isInRange(p.created_at_guesty, ctx.mtd_start, ctx.period_end_iso)) {
          guestMsgCountMtd += 1;
        }
        if (
          isInIsoRange(
            p.created_at_guesty,
            ctx.period_start_iso,
            ctx.period_end_iso
          )
        ) {
          guestMsgCountYesterday += 1;
        }
        // Latest guest message becomes the "pending" trigger; if there's
        // already a pending guest message (consecutive guest posts), we
        // dedupe to the FIRST so first-response time isn't misattributed.
        if (!pendingGuestAt) {
          pendingGuestAt = p.created_at_guesty;
          pendingGuestSubject = p.module_subject;
        }
      } else if (isHost && !p.is_automatic && pendingGuestAt) {
        const minutes = Math.max(
          0,
          (Date.parse(p.created_at_guesty) - Date.parse(pendingGuestAt)) / 60000
        );
        gaps.push({
          conversation_id: convId,
          agent: (p.from_full_name || 'Unknown agent').trim(),
          minutes,
          created_at: p.created_at_guesty,
          subject: pendingGuestSubject,
          is_first_response: !firstResponseSeen,
        });
        firstResponseSeen = true;
        pendingGuestAt = null;
        pendingGuestSubject = null;
      }
    }
  }

  // Bucket gaps by Yesterday vs MTD.
  const yesterdayGaps = gaps.filter(g =>
    isInIsoRange(g.created_at, ctx.period_start_iso, ctx.period_end_iso)
  );
  const mtdGaps = gaps.filter(g =>
    isInIsoRange(g.created_at, `${ctx.mtd_start}T00:00:00Z`, ctx.period_end_iso)
  );

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : round1(arr.reduce((s, x) => s + x, 0) / arr.length);

  const yesterdayAvg = avg(yesterdayGaps.map(g => g.minutes));
  const mtdAvg = avg(mtdGaps.map(g => g.minutes));
  const yesterdayFirstAvg = avg(
    yesterdayGaps.filter(g => g.is_first_response).map(g => g.minutes)
  );
  const mtdFirstAvg = avg(
    mtdGaps.filter(g => g.is_first_response).map(g => g.minutes)
  );

  // SLA buckets — Yesterday only (S3).
  const slaBuckets = [
    { bucket: '<1h' as const, count: 0 },
    { bucket: '1-4h' as const, count: 0 },
    { bucket: '4-24h' as const, count: 0 },
    { bucket: '>24h' as const, count: 0 },
  ];
  for (const g of yesterdayGaps) {
    const h = g.minutes / 60;
    if (h < 1) slaBuckets[0].count += 1;
    else if (h < 4) slaBuckets[1].count += 1;
    else if (h < 24) slaBuckets[2].count += 1;
    else slaBuckets[3].count += 1;
  }

  // Worst-2 agents — per-agent ranking on MTD data (more stable sample).
  const byAgent = new Map<string, { sum: number; n: number; slow: Gap[] }>();
  for (const g of mtdGaps) {
    const ent = byAgent.get(g.agent) || { sum: 0, n: 0, slow: [] };
    ent.sum += g.minutes;
    ent.n += 1;
    ent.slow.push(g);
    byAgent.set(g.agent, ent);
  }
  const worst_2_agents = [...byAgent.entries()]
    .filter(([_, v]) => v.n >= 5) // require min sample to avoid 1-shot outliers
    .map(([agent_name, v]) => ({
      agent_name,
      avg_response_minutes: round1(v.sum / v.n),
      sample_size: v.n,
      slow_threads: v.slow
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 5)
        .map(g => ({
          conversation_id: g.conversation_id,
          subject: g.subject,
          minutes: round1(g.minutes),
          created_at: g.created_at,
        })),
    }))
    .sort((a, b) => b.avg_response_minutes - a.avg_response_minutes)
    .slice(0, 2);

  if (gaps.length === 0) {
    warnings.push(
      'no_conversation_posts_synced — daily sync hasnt populated guesty_conversation_posts yet (first build after migration 0028)'
    );
  }

  return {
    section: {
      yesterday: {
        avg_response_minutes: yesterdayAvg,
        first_response_avg_minutes: yesterdayFirstAvg,
        guest_message_count: guestMsgCountYesterday,
        sample_size: yesterdayGaps.length,
      },
      mtd: {
        avg_response_minutes: mtdAvg,
        first_response_avg_minutes: mtdFirstAvg,
        guest_message_count: guestMsgCountMtd,
        sample_size: mtdGaps.length,
      },
      worst_2_agents,
      sla_buckets_yesterday: slaBuckets,
    },
    warnings,
  };
}

function isInRange(iso: string, fromYmd: string, toIso: string): boolean {
  return iso >= `${fromYmd}T00:00:00Z` && iso <= toIso;
}
function isInIsoRange(iso: string, fromIso: string, toIso: string): boolean {
  return iso >= fromIso && iso <= toIso;
}

function emptyConversationsSection(): ConversationsSection {
  return {
    yesterday: { avg_response_minutes: 0, first_response_avg_minutes: 0, guest_message_count: 0, sample_size: 0 },
    mtd: { avg_response_minutes: 0, first_response_avg_minutes: 0, guest_message_count: 0, sample_size: 0 },
    worst_2_agents: [],
    sla_buckets_yesterday: [
      { bucket: '<1h', count: 0 },
      { bucket: '1-4h', count: 0 },
      { bucket: '4-24h', count: 0 },
      { bucket: '>24h', count: 0 },
    ],
  };
}
