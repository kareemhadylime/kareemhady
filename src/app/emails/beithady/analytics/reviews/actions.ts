'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { generateReviewReplyDraft } from '@/lib/beithady/pipeline/review-replies';
import { guestyFetch } from '@/lib/guesty';

async function requireFull() {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'analytics', 'full'));
  if (!allowed) throw new Error('forbidden');
  return user;
}

// Manual generation — when the cron hasn't picked up a review yet
export async function generateReplyAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const reviewId = String(formData.get('review_id') || '').trim();
  if (!reviewId) throw new Error('missing_review_id');

  const sb = supabaseAdmin();
  const { data: review } = await sb
    .from('guesty_reviews')
    .select('id, raw_review, channel_id, listing_id')
    .eq('id', reviewId)
    .maybeSingle();
  if (!review) throw new Error('review_not_found');
  const r = review as { id: string; raw_review: Record<string, unknown> | null; channel_id: string | null; listing_id: string | null };

  const raw = r.raw_review || {};
  const text = (raw.public_review as string | undefined) || '';
  if (!text.trim()) throw new Error('empty_review');

  let listingNickname: string | null = null;
  let buildingCode: string | null = null;
  if (r.listing_id) {
    const { data: l } = await sb.from('guesty_listings').select('nickname, building_code').eq('id', r.listing_id).maybeSingle();
    if (l) {
      listingNickname = (l as { nickname: string | null }).nickname;
      buildingCode = (l as { building_code: string | null }).building_code;
    }
  }

  const result = await generateReviewReplyDraft({
    id: r.id,
    rating: typeof raw.overall_rating === 'number' ? Math.round(raw.overall_rating) : null,
    text,
    reviewer_name: null,
    language_hint: null,
    listing_nickname: listingNickname,
    building_code: buildingCode,
    reservation_confirmation_code: (raw.reservation_confirmation_code as string | null) || null,
    channel: r.channel_id,
  });

  await sb.from('beithady_review_replies').upsert(
    {
      guesty_review_id: r.id,
      language: result.language,
      rating: typeof raw.overall_rating === 'number' ? Math.round(raw.overall_rating) : null,
      ai_draft: result.draft,
      raw: result.raw as object,
      status: 'draft',
    },
    { onConflict: 'guesty_review_id' }
  );

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'review_reply_generated',
    target_type: 'review',
    target_id: r.id,
  });
  revalidatePath('/emails/beithady/analytics/reviews');
}

export async function regenerateReplyAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const replyId = String(formData.get('reply_id') || '').trim();
  if (!replyId) throw new Error('missing_reply_id');

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('beithady_review_replies')
    .select('id, guesty_review_id, status')
    .eq('id', replyId)
    .maybeSingle();
  if (!row) throw new Error('reply_not_found');
  if ((row as { status: string }).status === 'sent') throw new Error('already_sent');

  // Delete + regenerate
  await sb.from('beithady_review_replies').delete().eq('id', replyId);
  const fakeFd = new FormData();
  fakeFd.set('review_id', (row as { guesty_review_id: string }).guesty_review_id);
  await generateReplyAction(fakeFd);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'review_reply_regenerated',
    target_type: 'review',
    target_id: (row as { guesty_review_id: string }).guesty_review_id,
  });
}

export async function sendReplyAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const replyId = String(formData.get('reply_id') || '').trim();
  const finalText = String(formData.get('agent_final') || '').trim();
  if (!replyId) throw new Error('missing_reply_id');
  if (!finalText) throw new Error('empty_reply');

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('beithady_review_replies')
    .select('id, guesty_review_id, status')
    .eq('id', replyId)
    .maybeSingle();
  if (!row) throw new Error('reply_not_found');
  const rr = row as { id: string; guesty_review_id: string; status: string };
  if (rr.status === 'sent') throw new Error('already_sent');

  // Try posting back via Guesty Open API. Tier-gated; on failure the agent uses the deep-link.
  let sendError: string | null = null;
  try {
    await guestyFetch(`/reviews/${rr.guesty_review_id}/replies`, {
      method: 'POST',
      body: { reply: finalText },
    });
  } catch (e) {
    sendError = e instanceof Error ? e.message : String(e);
  }

  if (sendError) {
    await sb.from('beithady_review_replies').update({
      agent_final: finalText,
      status: 'failed',
      send_error: sendError.slice(0, 500),
      approved_by_user_id: user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', rr.id);
    await recordAudit({
      actor_user_id: user.id,
      module: 'communication',
      action: 'review_reply_send_failed',
      target_type: 'review',
      target_id: rr.guesty_review_id,
      metadata: { error: sendError },
    });
  } else {
    await sb.from('beithady_review_replies').update({
      agent_final: finalText,
      status: 'sent',
      approved_by_user_id: user.id,
      approved_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      send_error: null,
    }).eq('id', rr.id);
    await recordAudit({
      actor_user_id: user.id,
      module: 'communication',
      action: 'review_reply_sent',
      target_type: 'review',
      target_id: rr.guesty_review_id,
    });
  }

  revalidatePath('/emails/beithady/analytics/reviews');
}

export async function dismissReplyAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const replyId = String(formData.get('reply_id') || '').trim();
  if (!replyId) throw new Error('missing_reply_id');
  const sb = supabaseAdmin();
  await sb.from('beithady_review_replies').update({ status: 'dismissed' }).eq('id', replyId).neq('status', 'sent');
  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'review_reply_dismissed',
    target_type: 'review_reply',
    target_id: replyId,
  });
  revalidatePath('/emails/beithady/analytics/reviews');
}
