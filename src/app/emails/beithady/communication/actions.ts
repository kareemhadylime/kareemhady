'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { sendGuestyMessage, type SendGuestyResult } from '@/lib/beithady/communication/send-guesty';
import { recordAudit } from '@/lib/beithady/audit';

// Server actions for the Communication module. Today: Guesty send +
// AI kill-switch toggle. Phase C.3 adds Green-API send + voice + file;
// Phase E hooks AI auto-reply gating into the same send pipeline.

export async function sendGuestyMessageAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');

  const conversationId = String(formData.get('conversation_id') || '').trim();
  const body = String(formData.get('body') || '').trim();
  const moduleRaw = String(formData.get('module') || '').trim();
  const moduleVal = (['email','sms','whatsapp','log'] as const).find(m => m === moduleRaw);
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
  revalidatePath('/emails/beithady/communication/guesty');
  revalidatePath('/emails/beithady/communication/unified');

  if (!result.ok) {
    // Encode the error + fallback URL into the redirect target so the
    // composer can render an inline failure card with a Reply-in-Guesty
    // button. Capped to keep URLs sane.
    const params = new URLSearchParams();
    params.set('c', conversationId);
    params.set('send_error', result.error.slice(0, 200));
    params.set('send_status', String(result.status));
    if (result.fallbackUrl) params.set('fallback', result.fallbackUrl);
    redirect(`/emails/beithady/communication/guesty?${params.toString()}`);
  }

  // Success: redirect back to the thread with a tick query for the UI.
  redirect(`/emails/beithady/communication/guesty?c=${conversationId}&sent=1`);
}

export async function toggleKillSwitchAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');

  const conversationId = String(formData.get('conversation_id') || '').trim();
  const next = formData.get('next') === 'on';
  if (!conversationId) throw new Error('missing_conversation_id');

  const { supabaseAdmin } = await import('@/lib/supabase');
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
  revalidatePath('/emails/beithady/communication/guesty');
  revalidatePath('/emails/beithady/communication/unified');
}
