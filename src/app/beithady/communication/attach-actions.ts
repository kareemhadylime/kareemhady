'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWaCasualMessage, uploadWaMedia } from '@/lib/beithady/communication/send-wa-casual';
import { sendGuestyMessage } from '@/lib/beithady/communication/send-guesty';
import { recordAudit } from '@/lib/beithady/audit';

// Phase Q.3 — multi-attachment send actions.
// Loops through up to 5 files per send, uploads each to Supabase Storage,
// then dispatches one WhatsApp/Guesty message per file with shared
// caption on the FIRST file only (per workflow Q8).

const MAX_FILES_PER_SEND = 5;

async function ensureFullPerm(): Promise<{ id: string; username: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');
  return { id: user.id, username: user.username };
}

function extFromMime(mime: string): string {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.startsWith('image/jpeg')) return 'jpg';
  if (mime.startsWith('image/png')) return 'png';
  if (mime.startsWith('image/webp')) return 'webp';
  if (mime === 'application/pdf') return 'pdf';
  return 'bin';
}

// Multi-file send for wa_casual. FormData carries:
//   - conversation_id
//   - body (caption, attached to first file only)
//   - file_0, file_1, ... up to MAX_FILES_PER_SEND
//   - OR library_url_0, library_name_0, library_mime_0... when sourced from library
export async function sendWaCasualMultiAttachAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const conversationId = String(formData.get('conversation_id') || '').trim();
  if (!conversationId) throw new Error('missing_conversation_id');
  const caption = String(formData.get('body') || '').trim();

  // Collect up to MAX_FILES_PER_SEND files OR library refs.
  type Slot = { kind: 'file'; blob: Blob; name: string } | { kind: 'lib'; url: string; name: string; mime: string };
  const slots: Slot[] = [];
  for (let i = 0; i < MAX_FILES_PER_SEND; i++) {
    const f = formData.get(`file_${i}`);
    const libUrl = formData.get(`library_url_${i}`);
    if (f instanceof Blob && f.size > 0) {
      const name = (f as File).name || `file-${Date.now()}-${i}`;
      slots.push({ kind: 'file', blob: f, name });
    } else if (typeof libUrl === 'string' && libUrl.trim()) {
      slots.push({
        kind: 'lib',
        url: libUrl.trim(),
        name: String(formData.get(`library_name_${i}`) || `library-${i}.bin`),
        mime: String(formData.get(`library_mime_${i}`) || 'application/octet-stream'),
      });
    }
  }

  if (slots.length === 0) {
    redirect(`/beithady/communication/wa-casual?c=${conversationId}`);
  }

  let succeeded = 0;
  let lastError: string | null = null;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    let url: string;
    let name: string;
    let mime: string;
    if (slot.kind === 'file') {
      const blob = slot.blob;
      mime = blob.type || 'application/octet-stream';
      name = slot.name;
      const ab = await blob.arrayBuffer();
      const uploaded = await uploadWaMedia(ab, mime, extFromMime(mime));
      if (!uploaded.ok) {
        lastError = `upload_failed: ${uploaded.error}`;
        break;
      }
      url = uploaded.url;
    } else {
      url = slot.url;
      name = slot.name;
      mime = slot.mime;
    }

    const result = await sendWaCasualMessage({
      beithadyConversationId: conversationId,
      body: i === 0 ? caption : '', // shared caption on first only per Q8
      fileUrl: url,
      fileName: name,
      fileMime: mime,
      agentUserId: user.id,
      agentDisplayName: user.username,
    });
    if (!result.ok) {
      lastError = result.error;
      break;
    }
    succeeded += 1;
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'multi_attach_wa_casual',
    target_type: 'conversation',
    target_id: conversationId,
    metadata: { total: slots.length, succeeded, lastError: lastError || undefined },
  });

  revalidatePath('/beithady/communication/wa-casual');
  revalidatePath('/beithady/communication/unified');

  if (lastError) {
    const params = new URLSearchParams();
    params.set('c', conversationId);
    params.set('send_error', `${lastError} (sent ${succeeded}/${slots.length})`);
    params.set('send_status', '500');
    redirect(`/beithady/communication/wa-casual?${params.toString()}`);
  }
  redirect(`/beithady/communication/wa-casual?c=${conversationId}&sent=1`);
}

// Multi-file send for Guesty. Uses sendGuestyMessage's already-wired
// attachments[] field per Q.0 finding. One message with N attachments.
export async function sendGuestyMultiAttachAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const conversationId = String(formData.get('conversation_id') || '').trim();
  if (!conversationId) throw new Error('missing_conversation_id');
  const body = String(formData.get('body') || '').trim();
  const moduleRaw = String(formData.get('module') || 'whatsapp').trim();
  const moduleVal = (['email', 'sms', 'whatsapp', 'log', 'airbnb2', 'bookingCom'] as const).find(m => m === moduleRaw) || 'whatsapp';

  type AttachInput = { url: string; name: string; mime: string };
  const attachments: AttachInput[] = [];
  for (let i = 0; i < MAX_FILES_PER_SEND; i++) {
    const f = formData.get(`file_${i}`);
    const libUrl = formData.get(`library_url_${i}`);
    if (f instanceof Blob && f.size > 0) {
      const file = f as File;
      const mime = file.type || 'application/octet-stream';
      const ab = await file.arrayBuffer();
      const uploaded = await uploadWaMedia(ab, mime, extFromMime(mime));
      if (!uploaded.ok) {
        const params = new URLSearchParams();
        params.set('c', conversationId);
        params.set('send_error', `upload_failed: ${uploaded.error}`);
        redirect(`/beithady/communication/guesty?${params.toString()}`);
      }
      attachments.push({ url: uploaded.url, name: file.name || `file-${i}`, mime });
    } else if (typeof libUrl === 'string' && libUrl.trim()) {
      attachments.push({
        url: libUrl.trim(),
        name: String(formData.get(`library_name_${i}`) || `library-${i}.bin`),
        mime: String(formData.get(`library_mime_${i}`) || 'application/octet-stream'),
      });
    }
  }

  if (!body && attachments.length === 0) {
    redirect(`/beithady/communication/guesty?c=${conversationId}`);
  }

  const result = await sendGuestyMessage({
    beithadyConversationId: conversationId,
    body: body || '(see attachments)',
    module: moduleVal,
    agentUserId: user.id,
    agentDisplayName: user.username,
    attachments,
  });

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'multi_attach_guesty',
    target_type: 'conversation',
    target_id: conversationId,
    metadata: { count: attachments.length, ok: result.ok, status: 'status' in result ? result.status : undefined },
  });

  revalidatePath('/beithady/communication/guesty');
  revalidatePath('/beithady/communication/unified');

  if (!result.ok) {
    const params = new URLSearchParams();
    params.set('c', conversationId);
    params.set('send_error', result.error.slice(0, 200));
    params.set('send_status', String(result.status));
    if (result.fallbackUrl) params.set('fallback', result.fallbackUrl);
    redirect(`/beithady/communication/guesty?${params.toString()}`);
  }
  redirect(`/beithady/communication/guesty?c=${conversationId}&sent=1`);
}

// =====================================================================
// Result-returning variants for programmatic invocation via useTransition
// =====================================================================
// The redirect/throw style above is meant for native <form action={...}>
// submission. When called programmatically (await action(fd) inside
// startTransition), redirect() throws NEXT_REDIRECT and any other throw
// surfaces as React's generic "An unexpected response was received from
// the server" — losing the actual error detail. These variants NEVER
// throw and NEVER redirect; they return a structured result the caller
// handles client-side (router.push, error display, etc.).

export type MultiAttachResult = {
  ok: boolean;
  error?: string;
  redirectTo?: string;
  count?: number;
  status?: number;
};

export async function sendGuestyMultiAttachResult(formData: FormData): Promise<MultiAttachResult> {
  try {
    const user = await ensureFullPerm();
    const conversationId = String(formData.get('conversation_id') || '').trim();
    if (!conversationId) return { ok: false, error: 'missing_conversation_id' };
    const body = String(formData.get('body') || '').trim();
    const moduleRaw = String(formData.get('module') || 'whatsapp').trim();
    const moduleVal = (['email', 'sms', 'whatsapp', 'log', 'airbnb2', 'bookingCom'] as const).find(m => m === moduleRaw) || 'whatsapp';

    type AttachInput = { url: string; name: string; mime: string };
    const attachments: AttachInput[] = [];
    for (let i = 0; i < MAX_FILES_PER_SEND; i++) {
      const f = formData.get(`file_${i}`);
      const libUrl = formData.get(`library_url_${i}`);
      if (f instanceof Blob && f.size > 0) {
        const file = f as File;
        const mime = file.type || 'application/octet-stream';
        const ab = await file.arrayBuffer();
        const uploaded = await uploadWaMedia(ab, mime, extFromMime(mime));
        if (!uploaded.ok) {
          return { ok: false, error: `upload_failed: ${uploaded.error}` };
        }
        attachments.push({ url: uploaded.url, name: file.name || `file-${i}`, mime });
      } else if (typeof libUrl === 'string' && libUrl.trim()) {
        attachments.push({
          url: libUrl.trim(),
          name: String(formData.get(`library_name_${i}`) || `library-${i}.bin`),
          mime: String(formData.get(`library_mime_${i}`) || 'application/octet-stream'),
        });
      }
    }

    if (!body && attachments.length === 0) {
      return { ok: false, error: 'no_files_or_body' };
    }

    const result = await sendGuestyMessage({
      beithadyConversationId: conversationId,
      body: body || '(see attachments)',
      module: moduleVal,
      agentUserId: user.id,
      agentDisplayName: user.username,
      attachments,
    });

    await recordAudit({
      actor_user_id: user.id,
      module: 'communication',
      action: 'multi_attach_guesty',
      target_type: 'conversation',
      target_id: conversationId,
      metadata: { count: attachments.length, ok: result.ok, status: 'status' in result ? result.status : undefined },
    });

    revalidatePath('/beithady/communication/guesty');
    revalidatePath('/beithady/communication/unified');

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        status: result.status,
        count: attachments.length,
      };
    }
    return {
      ok: true,
      count: attachments.length,
      redirectTo: `/beithady/communication/unified?c=${conversationId}&sent=1`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function sendWaCasualMultiAttachResult(formData: FormData): Promise<MultiAttachResult> {
  try {
    const user = await ensureFullPerm();
    const conversationId = String(formData.get('conversation_id') || '').trim();
    if (!conversationId) return { ok: false, error: 'missing_conversation_id' };
    const caption = String(formData.get('body') || '').trim();

    type Slot = { kind: 'file'; blob: Blob; name: string } | { kind: 'lib'; url: string; name: string; mime: string };
    const slots: Slot[] = [];
    for (let i = 0; i < MAX_FILES_PER_SEND; i++) {
      const f = formData.get(`file_${i}`);
      const libUrl = formData.get(`library_url_${i}`);
      if (f instanceof Blob && f.size > 0) {
        const name = (f as File).name || `file-${Date.now()}-${i}`;
        slots.push({ kind: 'file', blob: f, name });
      } else if (typeof libUrl === 'string' && libUrl.trim()) {
        slots.push({
          kind: 'lib',
          url: libUrl.trim(),
          name: String(formData.get(`library_name_${i}`) || `library-${i}.bin`),
          mime: String(formData.get(`library_mime_${i}`) || 'application/octet-stream'),
        });
      }
    }

    if (slots.length === 0) {
      return { ok: false, error: 'no_files' };
    }

    let succeeded = 0;
    let lastError: string | null = null;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      let url: string;
      let name: string;
      let mime: string;
      if (slot.kind === 'file') {
        mime = slot.blob.type || 'application/octet-stream';
        name = slot.name;
        const ab = await slot.blob.arrayBuffer();
        const uploaded = await uploadWaMedia(ab, mime, extFromMime(mime));
        if (!uploaded.ok) {
          lastError = `upload_failed: ${uploaded.error}`;
          break;
        }
        url = uploaded.url;
      } else {
        url = slot.url;
        name = slot.name;
        mime = slot.mime;
      }
      const result = await sendWaCasualMessage({
        beithadyConversationId: conversationId,
        body: i === 0 ? caption : '',
        fileUrl: url,
        fileName: name,
        fileMime: mime,
        agentUserId: user.id,
        agentDisplayName: user.username,
      });
      if (!result.ok) {
        lastError = result.error;
        break;
      }
      succeeded += 1;
    }

    await recordAudit({
      actor_user_id: user.id,
      module: 'communication',
      action: 'multi_attach_wa_casual',
      target_type: 'conversation',
      target_id: conversationId,
      metadata: { total: slots.length, succeeded, lastError: lastError || undefined },
    });

    revalidatePath('/beithady/communication/wa-casual');
    revalidatePath('/beithady/communication/unified');

    if (lastError) {
      return { ok: false, error: `${lastError} (sent ${succeeded}/${slots.length})`, status: 500, count: succeeded };
    }
    return {
      ok: true,
      count: succeeded,
      redirectTo: `/beithady/communication/unified?c=${conversationId}&sent=1`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// --- Library asset upload (admin) ---------------------------------------

export async function uploadListingAssetAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const listingId = String(formData.get('listing_id') || '').trim();
  const category = String(formData.get('category') || 'photo').trim();
  const caption = String(formData.get('caption') || '').trim() || null;
  const file = formData.get('file');
  const returnTo = String(formData.get('return_to') || '/beithady/settings');
  if (!listingId) throw new Error('missing_listing_id');
  if (!(file instanceof Blob) || file.size === 0) throw new Error('missing_file');

  const f = file as File;
  const mime = f.type || 'application/octet-stream';
  const ext = extFromMime(mime);
  const ab = await f.arrayBuffer();

  const sb = supabaseAdmin();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const id = Math.random().toString(36).slice(2, 10);
  const path = `listing/${listingId}/${ts}-${id}.${ext}`;
  const { error } = await sb.storage
    .from('beithady-gallery-public')
    .upload(path, new Uint8Array(ab), { contentType: mime, upsert: false });
  if (error) throw new Error(`storage_upload_failed: ${error.message}`);

  const { data: urlData } = sb.storage.from('beithady-gallery-public').getPublicUrl(path);
  await sb.from('beithady_listing_assets').insert({
    listing_id: listingId,
    category,
    storage_path: path,
    public_url: urlData.publicUrl,
    caption,
    mime_type: mime,
    size_bytes: f.size,
    uploaded_by_user_id: user.id,
  });

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'listing_asset_uploaded',
    target_type: 'listing',
    target_id: listingId,
    after: { category, mime, size: f.size },
  });

  revalidatePath(returnTo);
  redirect(returnTo);
}

export async function deleteListingAssetAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const id = String(formData.get('id') || '').trim();
  const returnTo = String(formData.get('return_to') || '/beithady/settings');
  if (!id) throw new Error('missing_id');

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('beithady_listing_assets')
    .select('storage_path, listing_id')
    .eq('id', id)
    .maybeSingle();
  await sb.from('beithady_listing_assets').delete().eq('id', id);
  if (row && (row as { storage_path: string }).storage_path) {
    await sb.storage.from('beithady-gallery-public').remove([(row as { storage_path: string }).storage_path]);
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'listing_asset_deleted',
    target_type: 'listing_asset',
    target_id: id,
  });

  revalidatePath(returnTo);
  redirect(returnTo);
}
