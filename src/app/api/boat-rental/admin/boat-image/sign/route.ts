import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBoatRole } from '@/lib/boat-rental/auth';

// Issues a Supabase Storage signed upload URL so the browser can PUT
// the image bytes directly to Supabase, skipping the Vercel Server
// Action body limit (~4.5MB). Admin-only.

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const BUCKET = 'boat-rental';
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_BYTES = 5 * 1024 * 1024; // 5MB per image

type Body = {
  boatId: string;
  mime: string;
  size: number;
};

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBoatRole(me, 'admin'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.boatId || !body.mime || !ALLOWED_MIME[body.mime]) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  if (!Number.isFinite(body.size) || body.size <= 0 || body.size > MAX_BYTES) {
    return NextResponse.json({ error: 'invalid_size' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Verify boat exists (extra guard — the storage_path will be checked
  // server-side too on attach, but failing here gives a clearer error).
  const { data: boat } = await sb
    .from('boat_rental_boats')
    .select('id')
    .eq('id', body.boatId)
    .maybeSingle();
  if (!boat) return NextResponse.json({ error: 'boat_not_found' }, { status: 404 });

  // Cap images per boat at 10 — refuse the upload URL if already at limit.
  const { count } = await sb
    .from('boat_rental_boat_images')
    .select('id', { count: 'exact', head: true })
    .eq('boat_id', body.boatId);
  if ((count || 0) >= 10) {
    return NextResponse.json({ error: 'image_limit_reached' }, { status: 409 });
  }

  const ext = ALLOWED_MIME[body.mime];
  const path = `boats/${body.boatId}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'sign_failed' }, { status: 500 });
  }
  // Supabase returns a fully-qualified signed URL the browser can PUT to.
  return NextResponse.json({ signedUrl: data.signedUrl, path: data.path, token: data.token });
}
