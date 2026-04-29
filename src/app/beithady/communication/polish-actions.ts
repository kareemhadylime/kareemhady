'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';

// Phase Q.4 — polish bundle server actions: internal notes,
// mark-resolved, translate.

const ALL_INBOX_PATHS = [
  '/beithady/communication/guesty',
  '/beithady/communication/wa-casual',
  '/beithady/communication/wa-cloud',
  '/beithady/communication/unified',
];

async function ensureFullPerm(): Promise<{ id: string; username: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed =
    user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');
  return { id: user.id, username: user.username };
}

function revalidateInbox() {
  for (const p of ALL_INBOX_PATHS) revalidatePath(p);
}

// --- Internal notes ----------------------------------------------------

export async function addInternalNoteAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const conversationId = String(formData.get('conversation_id') || '').trim();
  const body = String(formData.get('body') || '').trim();
  const returnTo = String(formData.get('return_to') || '/beithady/communication/unified');
  if (!conversationId) throw new Error('missing_conversation_id');
  if (!body) throw new Error('empty_body');

  const sb = supabaseAdmin();
  await sb
    .from('beithady_conversation_notes')
    .insert({
      conversation_id: conversationId,
      author_user_id: user.id,
      body,
    });

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'note_added',
    target_type: 'conversation',
    target_id: conversationId,
  });

  revalidateInbox();
  redirect(returnTo);
}

export async function deleteInternalNoteAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const id = String(formData.get('id') || '').trim();
  const returnTo = String(formData.get('return_to') || '/beithady/communication/unified');
  if (!id) throw new Error('missing_id');

  const sb = supabaseAdmin();
  // Author or admin can delete (RLS enforced via app_users)
  await sb.from('beithady_conversation_notes').delete().eq('id', id);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'note_deleted',
    target_type: 'conversation_note',
    target_id: id,
  });

  revalidateInbox();
  redirect(returnTo);
}

// --- Mark resolved -----------------------------------------------------

export async function markResolvedAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const conversationId = String(formData.get('conversation_id') || '').trim();
  const reason = String(formData.get('reason') || 'resolved').trim();
  const returnTo = String(formData.get('return_to') || '/beithady/communication/unified');
  const validReasons = ['resolved', 'spam', 'no_response', 'booked', 'duplicate'];
  if (!conversationId) throw new Error('missing_conversation_id');
  if (!validReasons.includes(reason)) throw new Error('invalid_reason');

  const sb = supabaseAdmin();
  await sb
    .from('beithady_conversations')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_reason: reason,
      resolved_by_user_id: user.id,
      state: 'closed',
    })
    .eq('id', conversationId)
    .is('resolved_at', null);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'mark_resolved',
    target_type: 'conversation',
    target_id: conversationId,
    after: { reason },
  });

  revalidateInbox();
  redirect(returnTo);
}

export async function unmarkResolvedAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const conversationId = String(formData.get('conversation_id') || '').trim();
  const returnTo = String(formData.get('return_to') || '/beithady/communication/unified');
  if (!conversationId) throw new Error('missing_conversation_id');

  const sb = supabaseAdmin();
  await sb
    .from('beithady_conversations')
    .update({
      resolved_at: null,
      resolved_reason: null,
      resolved_by_user_id: null,
      state: 'open',
    })
    .eq('id', conversationId);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'unmark_resolved',
    target_type: 'conversation',
    target_id: conversationId,
  });

  revalidateInbox();
  redirect(returnTo);
}
