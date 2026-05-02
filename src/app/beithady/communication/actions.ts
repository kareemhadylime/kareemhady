'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { sendGuestyMessage, type SendGuestyResult } from '@/lib/beithady/communication/send-guesty';
import { sendWaCasualMessage, uploadWaMedia } from '@/lib/beithady/communication/send-wa-casual';
import {
  resolveTargetChannel,
  sendViaChannel,
  setPreferredChannel,
  targetIsCrossChannel,
  type ChannelTarget,
  type HomeChannel,
} from '@/lib/beithady/communication/channel-switch';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';

// Server actions for the Communication module. Today: Guesty send +
// AI kill-switch toggle. Phase C.3 adds Green-API send + voice + file;
// Phase E hooks AI auto-reply gating into the same send pipeline.

// Audit fix H-D9: prefix the multi-channel backup body with a short
// explanatory tag so the guest sees "Email backup of WhatsApp message"
// instead of two unannotated copies. Returns null if both channels
// resolve to the same friendly label (no useful prefix to show).
function backupChannelLabel(backup: ChannelTarget, primary: ChannelTarget): string | null {
  const friendly = (t: ChannelTarget): string => {
    if (t === 'guesty_email') return 'Email';
    if (t === 'guesty_sms') return 'SMS';
    if (t === 'guesty_whatsapp' || t === 'wa_cloud' || t === 'wa_casual') return 'WhatsApp';
    return t;
  };
  const a = friendly(backup);
  const b = friendly(primary);
  if (a === b) return null;
  return `(${a} backup of our ${b} message — same content)`;
}

export async function sendGuestyMessageAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');

  const conversationId = String(formData.get('conversation_id') || '').trim();
  const body = String(formData.get('body') || '').trim();
  const moduleRaw = String(formData.get('module') || '').trim();
  // Allow source-native modules ('airbnb2', 'bookingCom') so Airbnb /
  // Booking threads can submit replies through the platform's in-app
  // messaging instead of WhatsApp.
  const moduleVal = (['email','sms','whatsapp','log','airbnb2','bookingCom'] as const).find(m => m === moduleRaw);
  if (!conversationId) throw new Error('missing_conversation_id');
  if (!body) throw new Error('empty_body');
  if (body.length > 5000) throw new Error('body_too_long');

  const result: SendGuestyResult = await sendGuestyMessage({
    beithadyConversationId: conversationId,
    body,
    module: moduleVal,
    agentUserId: user.id,
    agentDisplayName: user.username,
  });

  // Always revalidate the thread to surface either the new message or
  // the error banner, then redirect with status query so the client UI
  // can show the result inline.
  revalidatePath('/beithady/communication/guesty');
  revalidatePath('/beithady/communication/unified');

  if (!result.ok) {
    // Encode the error + fallback URL into the redirect target so the
    // composer can render an inline failure card with a Reply-in-Guesty
    // button. Capped to keep URLs sane.
    const params = new URLSearchParams();
    params.set('c', conversationId);
    params.set('send_error', result.error.slice(0, 200));
    params.set('send_status', String(result.status));
    if (result.fallbackUrl) params.set('fallback', result.fallbackUrl);
    redirect(`/beithady/communication/guesty?${params.toString()}`);
  }

  // Success: redirect back to the thread with a tick query for the UI.
  redirect(`/beithady/communication/guesty?c=${conversationId}&sent=1`);
}

// WhatsApp Casual — text-only send via server form action
export async function sendWaCasualMessageAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');

  const conversationId = String(formData.get('conversation_id') || '').trim();
  const body = String(formData.get('body') || '').trim();
  if (!conversationId) throw new Error('missing_conversation_id');
  if (!body) throw new Error('empty_body');
  if (body.length > 5000) throw new Error('body_too_long');

  const result = await sendWaCasualMessage({
    beithadyConversationId: conversationId,
    body,
    agentUserId: user.id,
    agentDisplayName: user.username,
  });

  revalidatePath('/beithady/communication/wa-casual');
  revalidatePath('/beithady/communication/unified');

  if (!result.ok) {
    const params = new URLSearchParams();
    params.set('c', conversationId);
    params.set('send_error', result.error.slice(0, 200));
    params.set('send_status', String(result.status));
    redirect(`/beithady/communication/wa-casual?${params.toString()}`);
  }
  redirect(`/beithady/communication/wa-casual?c=${conversationId}&sent=1`);
}

// WhatsApp Casual — voice / file send. Accepts a multipart upload from
// the client, persists to Supabase Storage, then sends the public URL
// to Green-API. Same flow handles voice notes (audio/ogg|webm) and
// arbitrary attachments (image/pdf/etc).
export async function sendWaCasualVoiceAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');

  const conversationId = String(formData.get('conversation_id') || '').trim();
  if (!conversationId) throw new Error('missing_conversation_id');

  // Accept either an `audio` (voice) or `file` (attachment) blob.
  const audio = formData.get('audio');
  const file = formData.get('file');
  const blob = (audio instanceof Blob ? audio : null) ?? (file instanceof Blob ? file : null);
  if (!blob) throw new Error('missing_blob');

  const mime = String(formData.get('mime') || blob.type || 'application/octet-stream');
  const fileName = String(formData.get('file_name') || `voice-${Date.now()}`);
  const ext =
    mime.includes('ogg') ? 'ogg' :
    mime.includes('webm') ? 'webm' :
    mime.includes('mp4') ? 'm4a' :
    mime.startsWith('image/jpeg') ? 'jpg' :
    mime.startsWith('image/png') ? 'png' :
    mime.startsWith('image/webp') ? 'webp' :
    mime === 'application/pdf' ? 'pdf' :
    'bin';

  const ab = await blob.arrayBuffer();
  const uploaded = await uploadWaMedia(ab, mime, ext);
  if (!uploaded.ok) throw new Error(`upload_failed: ${uploaded.error}`);

  const captionRaw = String(formData.get('body') || '').trim();
  const result = await sendWaCasualMessage({
    beithadyConversationId: conversationId,
    body: captionRaw,
    fileUrl: uploaded.url,
    fileName,
    fileMime: mime,
    agentUserId: user.id,
    agentDisplayName: user.username,
  });

  revalidatePath('/beithady/communication/wa-casual');
  revalidatePath('/beithady/communication/unified');

  if (!result.ok) {
    // Audit fix H-E9: clean up the just-uploaded blob if the send
    // failed. Pre-fix, an aborted send (kill switch flipped, Green-API
    // down, network blip) left the audio/file in beithady-wa-media
    // forever with no message row referencing it. Cleanup is best-
    // effort; we still surface the original error.
    if (uploaded.path) {
      try {
        const sb = supabaseAdmin();
        await sb.storage.from('beithady-wa-media').remove([uploaded.path]);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[sendWaCasualVoiceAction] orphan blob cleanup failed:', e);
      }
    }
    const params = new URLSearchParams();
    params.set('c', conversationId);
    params.set('send_error', result.error.slice(0, 200));
    params.set('send_status', String(result.status));
    redirect(`/beithady/communication/wa-casual?${params.toString()}`);
  }
  redirect(`/beithady/communication/wa-casual?c=${conversationId}&sent=1`);
}

export async function toggleKillSwitchAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');

  const conversationId = String(formData.get('conversation_id') || '').trim();
  const next = formData.get('next') === 'on';
  if (!conversationId) throw new Error('missing_conversation_id');

  const sb = supabaseAdmin();
  await sb.from('beithady_conversations').update({ ai_kill_switch: next }).eq('id', conversationId);
  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'kill_switch_toggled',
    target_type: 'conversation',
    target_id: conversationId,
    after: { ai_kill_switch: next },
  });
  revalidatePath('/beithady/communication/guesty');
  revalidatePath('/beithady/communication/unified');
}

// =====================================================================
// Phase C.5 — Channel Switcher action
// =====================================================================
// Routes a single outbound through a transport that may differ from the
// conversation's home channel. On no-info errors (no_phone / no_email)
// returns to the thread with ?switch_revert=<reason> so the UI can show
// the no-info banner + Manual Revert button (Q8-c).
//
// Cross-channel sends still write a row into beithady_messages keyed
// by conversation_id so the thread view stays unified (Q4-a). The row
// is tagged with was_channel_switched=true + original_thread_channel for
// the inline "via X" badge.
//
// Multi-channel send (improvement #10) supported via the optional
// `backup_target` form field — both rows are recorded; backup failure
// is fail-soft (logged, not blocking).
export async function sendMessageWithSwitchAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');

  const conversationId = String(formData.get('conversation_id') || '').trim();
  const body = String(formData.get('body') || '').trim();
  const targetRaw = String(formData.get('target_channel') || '').trim();
  const backupRaw = String(formData.get('backup_target') || '').trim();
  const remember = formData.get('remember') === 'on';
  const returnPath = String(formData.get('return_path') || '/beithady/communication/unified').trim();

  if (!conversationId) throw new Error('missing_conversation_id');
  if (!body) throw new Error('empty_body');
  if (body.length > 5000) throw new Error('body_too_long');

  const ALLOWED: readonly string[] = ['guesty_email','guesty_sms','guesty_whatsapp','wa_casual','wa_cloud'];
  const valid = (t: string): t is ChannelTarget => ALLOWED.includes(t);
  if (!valid(targetRaw)) throw new Error('invalid_target_channel');
  const target: ChannelTarget = targetRaw;
  const backup: ChannelTarget | null = valid(backupRaw) ? backupRaw : null;

  const sb = supabaseAdmin();
  const { data: conv } = await sb
    .from('beithady_conversations')
    .select('id, channel, external_id, source, guest_id, guest_phone, guest_email, preferred_outbound_channel')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) {
    redirect(`${returnPath}?c=${conversationId}&switch_revert=conversation_not_found`);
  }
  const c = conv as {
    id: string;
    channel: HomeChannel;
    external_id: string;
    source: string | null;
    guest_id: string | null;
    guest_phone: string | null;
    guest_email: string | null;
    preferred_outbound_channel: string | null;
  };

  // F1: validate the requested target
  const resolved = await resolveTargetChannel(
    {
      conversationId: c.id,
      homeChannel: c.channel,
      externalId: c.external_id,
      source: c.source,
      guestId: c.guest_id,
      guestPhone: c.guest_phone,
      guestEmail: c.guest_email,
    },
    target,
  );
  if (!resolved.ok) {
    await recordAudit({
      actor_user_id: user.id,
      module: 'communication',
      action: 'channel_switch_blocked',
      target_type: 'conversation',
      target_id: c.id,
      metadata: { from: c.channel, to: target, reason: resolved.reason, body_length: body.length },
    });
    const params = new URLSearchParams();
    params.set('c', conversationId);
    params.set('switch_revert', resolved.reason);
    if (resolved.hint) params.set('switch_hint', resolved.hint);
    redirect(`${returnPath}?${params.toString()}`);
  }

  // F2: dispatch primary send.
  // Audit fix H-C3: cross-channel flags now passed atomically into the
  // send path so they're written in the original INSERT — pre-fix did
  // a post-insert UPDATE which left a race window where webhook ingest
  // / realtime saw the row with the column defaults.
  const isCross = targetIsCrossChannel(target, c.channel);
  const result = await sendViaChannel(target, {
    beithadyConversationId: c.id,
    body,
    agentUserId: user.id,
    agentDisplayName: user.username,
    wasChannelSwitched: isCross,
    originalThreadChannel: isCross ? c.channel : null,
  });

  // Persist preferred channel if "Remember" was checked (Q3-c).
  if (remember && result.ok) {
    await setPreferredChannel(c.id, target);
  }

  // Multi-channel "+Email backup" (improvement #10). Fail-soft —
  // primary success is what matters; backup outcome is recorded but
  // does not affect the redirect.
  if (backup && result.ok) {
    const backupResolved = await resolveTargetChannel(
      {
        conversationId: c.id,
        homeChannel: c.channel,
        externalId: c.external_id,
        source: c.source,
        guestId: c.guest_id,
        guestPhone: c.guest_phone,
        guestEmail: c.guest_email,
      },
      backup,
    );
    if (backupResolved.ok) {
      // Audit fix H-D9: prefix the backup body with a soft de-dup tag
      // so the guest sees "Email backup of WhatsApp message" / "WA
      // backup of email message" instead of two identical
      // unannotated copies. Pre-fix transactional templates (booking
      // confirmation with payment link) could be paid twice if the
      // guest got two unannotated copies.
      const backupPrefix = backupChannelLabel(backup, target);
      const backupBody = backupPrefix ? `${backupPrefix}\n\n${body}` : body;
      const isCrossBackup = targetIsCrossChannel(backup, c.channel);
      const backupResult = await sendViaChannel(backup, {
        beithadyConversationId: c.id,
        body: backupBody,
        agentUserId: user.id,
        agentDisplayName: user.username,
        wasChannelSwitched: isCrossBackup,
        originalThreadChannel: isCrossBackup ? c.channel : null,
      });
      await recordAudit({
        actor_user_id: user.id,
        module: 'communication',
        action: backupResult.ok ? 'channel_backup_sent' : 'channel_backup_failed',
        target_type: 'conversation',
        target_id: c.id,
        metadata: {
          backup_target: backup,
          ok: backupResult.ok,
          ...(backupResult.ok ? {} : { error: backupResult.error, status: backupResult.status }),
        },
      });
    } else {
      await recordAudit({
        actor_user_id: user.id,
        module: 'communication',
        action: 'channel_backup_unresolvable',
        target_type: 'conversation',
        target_id: c.id,
        metadata: { backup_target: backup, reason: backupResolved.reason },
      });
    }
  }

  // Audit primary outcome (metadata only — Q10).
  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: result.ok ? 'channel_switched' : 'channel_switch_send_failed',
    target_type: 'conversation',
    target_id: c.id,
    metadata: {
      from: c.channel,
      to: target,
      contact_used_hint: resolved.contact.phone ? 'phone' : 'email',
      body_length: body.length,
      cross_channel: targetIsCrossChannel(target, c.channel),
      ...(result.ok ? {} : { error: result.error, status: result.status }),
      remember,
      backup: backup || null,
    },
  });

  revalidatePath('/beithady/communication/guesty');
  revalidatePath('/beithady/communication/unified');
  revalidatePath('/beithady/communication/wa-casual');

  if (!result.ok) {
    const params = new URLSearchParams();
    params.set('c', conversationId);
    params.set('send_error', result.error.slice(0, 200));
    params.set('send_status', String(result.status));
    if ('fallbackUrl' in result && result.fallbackUrl) params.set('fallback', result.fallbackUrl);
    redirect(`${returnPath}?${params.toString()}`);
  }
  redirect(`${returnPath}?c=${conversationId}&sent=1&via=${target}`);
}
