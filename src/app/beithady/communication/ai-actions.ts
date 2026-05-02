'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { sendGuestyMessage } from '@/lib/beithady/communication/send-guesty';
import { sendWaCasualMessage } from '@/lib/beithady/communication/send-wa-casual';
import { reclassify } from '@/lib/beithady/ai/auto-reply';
import { recordAudit } from '@/lib/beithady/audit';

// Action: send the AI's suggested reply as-is. Marks the log row as
// agent_action='sent_as_is', creates the outbound message via the
// channel-appropriate sender, and links the outbound back to the log.
export async function acceptSuggestionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');

  const logId = String(formData.get('log_id') || '').trim();
  const conversationId = String(formData.get('conversation_id') || '').trim();
  if (!logId || !conversationId) throw new Error('missing_ids');

  const sb = supabaseAdmin();
  const { data: log } = await sb
    .from('beithady_ai_reply_log')
    .select('id, conversation_id, channel, suggested_reply, classification, confidence, agent_action')
    .eq('id', logId)
    .maybeSingle();
  if (!log) throw new Error('log_not_found');
  const l = log as {
    id: string;
    conversation_id: string;
    channel: 'guesty' | 'wa_cloud' | 'wa_casual';
    suggested_reply: string | null;
    classification: string;
    confidence: number;
    agent_action: string | null;
  };
  if (l.agent_action) throw new Error('already_actioned');
  if (!l.suggested_reply) throw new Error('no_suggested_reply');

  let outboundId: string | null = null;
  let errMsg: string | null = null;
  if (l.channel === 'wa_casual') {
    const r = await sendWaCasualMessage({
      beithadyConversationId: l.conversation_id,
      body: l.suggested_reply,
      agentUserId: user.id,
      agentDisplayName: user.username,
    });
    if (r.ok) outboundId = r.messageId;
    else errMsg = r.error;
  } else if (l.channel === 'guesty') {
    const r = await sendGuestyMessage({
      beithadyConversationId: l.conversation_id,
      body: l.suggested_reply,
      agentUserId: user.id,
      agentDisplayName: user.username,
    });
    if (r.ok) outboundId = r.messageId;
    else errMsg = r.error;
  }
  // wa_cloud auto-send waits for WABA setup (Phase H)

  if (!outboundId) {
    await recordAudit({
      actor_user_id: user.id,
      module: 'communication',
      action: 'ai_suggestion_send_failed',
      target_type: 'ai_reply_log',
      target_id: logId,
      metadata: { error: errMsg || 'unknown' },
    });
    // Audit fix H-D10: explicit return after redirect. Today
    // Next.js's redirect() throws an internal error to abort
    // execution, but if that contract ever changes (or a future
    // try/catch is added around the call site), the code below
    // would log `agent_action='sent_as_is'` against an outboundId
    // of null — fabricating a successful-send audit row.
    redirect(`/beithady/communication/${l.channel === 'guesty' ? 'guesty' : 'wa-casual'}?c=${conversationId}&send_error=${encodeURIComponent(errMsg || 'unknown')}`);
    return; // unreachable today, defensive against future regression
  }

  // Mark outbound as AI-driven + link back to the log row
  if (outboundId) {
    await sb.from('beithady_messages').update({
      is_automatic: false,
      ai_classification: l.classification,
      ai_confidence: l.confidence,
      ai_used_for_auto_send: false,
    }).eq('id', outboundId);
  }

  await sb.from('beithady_ai_reply_log').update({
    agent_action: 'sent_as_is',
    agent_action_at: new Date().toISOString(),
    agent_user_id: user.id,
    agent_final_body: l.suggested_reply,
    outbound_message_id: outboundId,
  }).eq('id', logId);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'ai_suggestion_accepted',
    target_type: 'ai_reply_log',
    target_id: logId,
    metadata: { classification: l.classification, confidence: l.confidence, outbound_message_id: outboundId },
  });

  revalidatePath('/beithady/communication/wa-casual');
  revalidatePath('/beithady/communication/guesty');
  revalidatePath('/beithady/communication/unified');
  redirect(`/beithady/communication/${l.channel === 'guesty' ? 'guesty' : 'wa-casual'}?c=${conversationId}&sent=1`);
}

export async function dismissSuggestionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');

  const logId = String(formData.get('log_id') || '').trim();
  if (!logId) throw new Error('missing_log_id');

  const sb = supabaseAdmin();
  await sb.from('beithady_ai_reply_log').update({
    agent_action: 'dismissed',
    agent_action_at: new Date().toISOString(),
    agent_user_id: user.id,
  }).eq('id', logId);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'ai_suggestion_dismissed',
    target_type: 'ai_reply_log',
    target_id: logId,
  });

  revalidatePath('/beithady/communication/wa-casual');
  revalidatePath('/beithady/communication/guesty');
  revalidatePath('/beithady/communication/unified');
}

export async function regenerateSuggestionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');

  const logId = String(formData.get('log_id') || '').trim();
  if (!logId) throw new Error('missing_log_id');

  const sb = supabaseAdmin();
  const { data: log } = await sb
    .from('beithady_ai_reply_log')
    .select('inbound_message_id')
    .eq('id', logId)
    .maybeSingle();
  if (!log) throw new Error('log_not_found');
  const inboundId = (log as { inbound_message_id: string }).inbound_message_id;

  await reclassify(inboundId);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'ai_suggestion_regenerated',
    target_type: 'ai_reply_log',
    target_id: logId,
  });

  revalidatePath('/beithady/communication/wa-casual');
  revalidatePath('/beithady/communication/guesty');
  revalidatePath('/beithady/communication/unified');
}

// Revert an auto-sent reply by sending an apology template + marking
// the log row as reverted. Per W-2 decision: if >48h passed (Cloud
// API delete window) we send the apology rather than try to delete.
export async function revertAutoSendAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');

  const logId = String(formData.get('log_id') || '').trim();
  if (!logId) throw new Error('missing_log_id');

  const sb = supabaseAdmin();
  const { data: log } = await sb
    .from('beithady_ai_reply_log')
    .select('id, conversation_id, channel, language_detected, reverted')
    .eq('id', logId)
    .maybeSingle();
  if (!log) throw new Error('log_not_found');
  const l = log as { id: string; conversation_id: string; channel: 'guesty'|'wa_cloud'|'wa_casual'; language_detected: string | null; reverted: boolean };
  if (l.reverted) throw new Error('already_reverted');

  const apology = apologyTemplate(l.language_detected || 'en');
  if (l.channel === 'wa_casual') {
    await sendWaCasualMessage({
      beithadyConversationId: l.conversation_id,
      body: apology,
      agentUserId: user.id,
      agentDisplayName: user.username,
    });
  }

  await sb.from('beithady_ai_reply_log').update({
    reverted: true,
    reverted_by_user_id: user.id,
    reverted_at: new Date().toISOString(),
    agent_action: 'reverted',
    agent_action_at: new Date().toISOString(),
    agent_user_id: user.id,
  }).eq('id', logId);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'ai_auto_send_reverted',
    target_type: 'ai_reply_log',
    target_id: logId,
  });

  revalidatePath('/beithady/settings/audit');
}

function apologyTemplate(lang: string): string {
  const map: Record<string, string> = {
    en: "Apologies — please disregard our last message. Our team will follow up with the correct information shortly.",
    ar: "نعتذر — يرجى تجاهل رسالتنا السابقة. سيتواصل معك فريقنا قريبًا بالمعلومات الصحيحة.",
    fr: "Toutes nos excuses — veuillez ignorer notre dernier message. Notre équipe vous recontactera rapidement avec les bonnes informations.",
    de: "Entschuldigung — bitte ignorieren Sie unsere letzte Nachricht. Unser Team meldet sich in Kürze mit den richtigen Informationen.",
    ru: "Приносим извинения — пожалуйста, проигнорируйте наше последнее сообщение. Наша команда свяжется с вами с правильной информацией.",
    it: "Ci scusiamo — vi preghiamo di ignorare il nostro ultimo messaggio. Il nostro team vi contatterà a breve con le informazioni corrette.",
    es: "Disculpas — por favor ignore nuestro último mensaje. Nuestro equipo se pondrá en contacto con la información correcta en breve.",
  };
  return map[lang] || map.en;
}
