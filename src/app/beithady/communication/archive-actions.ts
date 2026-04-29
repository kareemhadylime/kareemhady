'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';

// Phase R — Archive server actions.
// All restore + archive operations gated on `communication:full`.

const ALL_INBOX_PATHS = [
  '/beithady/communication/guesty',
  '/beithady/communication/wa-casual',
  '/beithady/communication/wa-cloud',
  '/beithady/communication/unified',
  '/beithady/communication/archive',
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

// --- Single-conversation archive ----------------------------------------

export async function archiveConversationSingleAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const conversationId = String(formData.get('conversation_id') || '').trim();
  const returnTo = String(formData.get('return_to') || '/beithady/communication/unified');
  if (!conversationId) throw new Error('missing_conversation_id');

  const sb = supabaseAdmin();
  await sb
    .from('beithady_conversations')
    .update({
      archived_at: new Date().toISOString(),
      archived_by_user_id: user.id,
      archived_reason: 'manual_single',
    })
    .eq('id', conversationId)
    .is('archived_at', null);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'archive_single',
    target_type: 'conversation',
    target_id: conversationId,
    after: { archived_reason: 'manual_single' },
  });

  revalidateInbox();
  redirect(returnTo);
}

// --- Single-conversation restore ----------------------------------------

export async function restoreConversationAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const conversationId = String(formData.get('conversation_id') || '').trim();
  const returnTo = String(formData.get('return_to') || '/beithady/communication/unified');
  if (!conversationId) throw new Error('missing_conversation_id');

  const sb = supabaseAdmin();
  await sb
    .from('beithady_conversations')
    .update({
      archived_at: null,
      archived_by_user_id: null,
      archived_reason: null,
    })
    .eq('id', conversationId);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'restore_single',
    target_type: 'conversation',
    target_id: conversationId,
  });

  revalidateInbox();
  redirect(returnTo);
}

// --- Bulk archive: every active conversation in a calendar month --------

export async function archiveConversationsMonthAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const year = parseInt(String(formData.get('year') || '0'), 10);
  const month = parseInt(String(formData.get('month') || '0'), 10);
  if (!year || !month || month < 1 || month > 12) throw new Error('invalid_year_month');

  // We bucket on coalesce(modified_at_external, last_inbound_at, created_at).
  // For Postgres update we approximate by using modified_at_external bounds.
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();

  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('beithady_conversations')
    .update({
      archived_at: new Date().toISOString(),
      archived_by_user_id: user.id,
      archived_reason: 'manual_month_bulk',
    })
    .is('archived_at', null)
    .gte('modified_at_external', start)
    .lt('modified_at_external', end)
    .select('id');

  const count = (rows as Array<{ id: string }> | null)?.length ?? 0;

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'archive_month_bulk',
    target_type: 'conversation_month',
    target_id: `${year}-${String(month).padStart(2, '0')}`,
    metadata: { year, month, archived_count: count },
  });

  revalidateInbox();
  redirect(`/beithady/communication/archive/${year}/${month}`);
}

// --- Bulk restore: multi-select restore from sidebar checkboxes ---------

export async function bulkRestoreConversationsAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const idsRaw = formData.getAll('conversation_id');
  const ids = idsRaw.map(v => String(v)).filter(Boolean);
  const returnTo = String(formData.get('return_to') || '/beithady/communication/archive');
  if (ids.length === 0) {
    revalidateInbox();
    redirect(returnTo);
  }

  const sb = supabaseAdmin();
  await sb
    .from('beithady_conversations')
    .update({
      archived_at: null,
      archived_by_user_id: null,
      archived_reason: null,
    })
    .in('id', ids);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'restore_bulk',
    target_type: 'conversation',
    metadata: { restored_count: ids.length, ids },
  });

  revalidateInbox();
  redirect(returnTo);
}
