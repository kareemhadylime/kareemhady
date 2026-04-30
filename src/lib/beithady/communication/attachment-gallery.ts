import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// Phase C.5 follow-up — multi-attachment gallery: one shareable URL
// for N images that the guest browses left/right.

export type GalleryItem = {
  url: string;
  name: string;
  mime: string;
};

export type GalleryRow = {
  id: string;
  token: string;
  conversation_id: string | null;
  items: GalleryItem[];
  created_at: string;
  expires_at: string | null;
};

const PUBLIC_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://limeinc.vercel.app';

function mintToken(): string {
  // 12-char URL-safe slug from base36(crypto random + ts).
  const ts = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `${ts}${r}`.slice(0, 14);
}

export async function createGallery(
  items: GalleryItem[],
  opts: {
    conversationId?: string | null;
    createdByUserId?: string | null;
    expiresInDays?: number;
  } = {},
): Promise<{ ok: true; token: string; publicUrl: string } | { ok: false; error: string }> {
  if (!items || items.length === 0) return { ok: false, error: 'no_items' };
  const sb = supabaseAdmin();
  const token = mintToken();
  const expiresAt = opts.expiresInDays
    ? new Date(Date.now() + opts.expiresInDays * 86400_000).toISOString()
    : null;
  const { error } = await sb
    .from('beithady_attachment_galleries')
    .insert({
      token,
      conversation_id: opts.conversationId || null,
      created_by_user_id: opts.createdByUserId || null,
      items: items as unknown as object,
      expires_at: expiresAt,
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true, token, publicUrl: `${PUBLIC_BASE}/g/${token}` };
}

export async function getGalleryByToken(token: string): Promise<GalleryRow | null> {
  if (!token || token.length < 6 || token.length > 40) return null;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_attachment_galleries')
    .select('id, token, conversation_id, items, created_at, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (!data) return null;
  const row = data as Omit<GalleryRow, 'items'> & { items: unknown };
  // expiry check
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return {
    ...row,
    items: Array.isArray(row.items) ? (row.items as GalleryItem[]) : [],
  };
}
