// src/lib/beithady/hr/hr-documents-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import type { AddDocumentInput, UpdateDocumentInput } from './hr-documents-types';

const REVALIDATE = '/beithady/hr/documents';
const BUCKET = 'hr-documents';

// ── addDocumentAction ─────────────────────────────────────────────────────────

export async function addDocumentAction(
  input: AddDocumentInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    if (!input.employee_id) return { ok: false, error: 'Employee is required' };
    if (!input.title.trim()) return { ok: false, error: 'Title is required' };

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('hr_employee_documents')
      .insert({
        employee_id:     input.employee_id,
        doc_type:        input.doc_type,
        title:           input.title.trim(),
        document_number: input.document_number || null,
        issue_date:      input.issue_date || null,
        expiry_date:     input.expiry_date || null,
        notes:           input.notes || null,
        created_by:      user.id,
        updated_at:      new Date().toISOString(),
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

// ── updateDocumentAction ──────────────────────────────────────────────────────

export async function updateDocumentAction(
  docId: string,
  input: UpdateDocumentInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');

    const sb = supabaseAdmin();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.doc_type        !== undefined) update.doc_type        = input.doc_type;
    if (input.title           !== undefined) update.title           = input.title.trim();
    if (input.document_number !== undefined) update.document_number = input.document_number || null;
    if (input.issue_date      !== undefined) update.issue_date      = input.issue_date || null;
    if (input.expiry_date     !== undefined) update.expiry_date     = input.expiry_date || null;
    if (input.notes           !== undefined) update.notes           = input.notes || null;

    const { error } = await sb
      .from('hr_employee_documents')
      .update(update)
      .eq('id', docId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── deleteDocumentAction ──────────────────────────────────────────────────────

export async function deleteDocumentAction(
  docId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');
    const sb = supabaseAdmin();

    const { data: doc } = await sb
      .from('hr_employee_documents')
      .select('file_path')
      .eq('id', docId)
      .single();

    if (doc?.file_path) {
      await sb.storage.from(BUCKET).remove([(doc as { file_path: string }).file_path]);
    }

    const { error } = await sb
      .from('hr_employee_documents')
      .delete()
      .eq('id', docId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── setDocumentFileAction ─────────────────────────────────────────────────────

export async function setDocumentFileAction(
  docId: string,
  filePath: string,
  fileName: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('hr_employee_documents')
      .update({ file_path: filePath, file_name: fileName, updated_at: new Date().toISOString() })
      .eq('id', docId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── getDocumentDownloadUrl ────────────────────────────────────────────────────

export async function getDocumentDownloadUrl(
  docId: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    const sb = supabaseAdmin();
    const { data: doc } = await sb
      .from('hr_employee_documents')
      .select('file_path')
      .eq('id', docId)
      .single();

    if (!(doc as { file_path: string | null } | null)?.file_path) {
      return { ok: false, error: 'No file attached' };
    }

    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrl((doc as { file_path: string }).file_path, 60);
    if (error || !data) return { ok: false, error: 'Storage error' };

    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
