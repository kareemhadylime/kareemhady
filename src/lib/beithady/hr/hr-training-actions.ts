// src/lib/beithady/hr/hr-training-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import type { AddTrainingInput, UpdateTrainingInput } from './hr-training-types';

const REVALIDATE = '/beithady/hr/training';
const BUCKET     = 'hr-training';

// ── addTrainingRecordAction ───────────────────────────────────────────────────

export async function addTrainingRecordAction(
  input: AddTrainingInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    if (!input.employee_id)    return { ok: false, error: 'Employee is required' };
    if (!input.title.trim())   return { ok: false, error: 'Title is required' };

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('hr_training_records')
      .insert({
        employee_id: input.employee_id,
        record_type: input.record_type,
        title:       input.title.trim(),
        date:        input.date        || null,
        expiry_date: input.expiry_date || null,
        notes:       input.notes       || null,
        created_by:  user.id,
        updated_at:  new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true, id: (data as { id: string }).id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── updateTrainingRecordAction ────────────────────────────────────────────────

export async function updateTrainingRecordAction(
  recordId: string,
  input: UpdateTrainingInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');

    const sb = supabaseAdmin();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.record_type !== undefined) update.record_type = input.record_type;
    if (input.title       !== undefined) update.title       = input.title.trim();
    if (input.date        !== undefined) update.date        = input.date || null;
    if (input.expiry_date !== undefined) update.expiry_date = input.expiry_date || null;
    if (input.notes       !== undefined) update.notes       = input.notes || null;

    const { error } = await sb
      .from('hr_training_records')
      .update(update)
      .eq('id', recordId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── deleteTrainingRecordAction ────────────────────────────────────────────────

export async function deleteTrainingRecordAction(
  recordId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');
    const sb = supabaseAdmin();

    const { data: rec } = await sb
      .from('hr_training_records')
      .select('file_path')
      .eq('id', recordId)
      .single();

    if (rec?.file_path) {
      await sb.storage.from(BUCKET).remove([(rec as { file_path: string }).file_path]);
    }

    const { error } = await sb
      .from('hr_training_records')
      .delete()
      .eq('id', recordId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── setTrainingRecordFileAction ───────────────────────────────────────────────

export async function setTrainingRecordFileAction(
  recordId: string,
  filePath: string,
  fileName: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('hr_training_records')
      .update({ file_path: filePath, file_name: fileName, updated_at: new Date().toISOString() })
      .eq('id', recordId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── getTrainingRecordDownloadUrl ──────────────────────────────────────────────

export async function getTrainingRecordDownloadUrl(
  recordId: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    const sb = supabaseAdmin();
    const { data: rec } = await sb
      .from('hr_training_records')
      .select('file_path')
      .eq('id', recordId)
      .single();

    if (!(rec as { file_path: string | null } | null)?.file_path) {
      return { ok: false, error: 'No file attached' };
    }

    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrl((rec as { file_path: string }).file_path, 60);
    if (error || !data) return { ok: false, error: 'Storage error' };

    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
