import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBoatRole } from '@/lib/boat-rental/auth';
import { signedImageUrl } from '@/lib/boat-rental/storage';
import { classifyBoatPhoto } from '@/lib/boat-rental/photo-classifier';

// Inserts a boat_rental_boat_images row pointing at a path the browser
// already uploaded directly to Supabase Storage via a signed URL. Admin
// only. Path is validated to live under boats/{boatId}/ so a malicious
// client can't attach an arbitrary storage object.
//
// After insert, the photo is auto-classified via Claude Haiku 4.5
// vision into one of full_boat / seating / interior / bathroom /
// other. Adds ~1-2s to the upload but the resulting category drives
// the smart photo picker on the catalogue + PDF. If the call fails or
// no API key is set, the row stays with category=null and the admin
// can re-tag via the per-boat backfill button.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Body = {
  boatId: string;
  path: string;
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
  if (!body.boatId || !body.path) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  // Path must be within this boat's namespace — protects against attaching
  // someone else's storage object.
  const expectedPrefix = `boats/${body.boatId}/`;
  if (!body.path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'path_mismatch' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  // Verify the object actually exists in storage (signed URL was used).
  // list returns objects under the given prefix; we filter to our exact name.
  const fileName = body.path.slice(expectedPrefix.length);
  const { data: list, error: listErr } = await sb.storage
    .from('boat-rental')
    .list(`boats/${body.boatId}`, { limit: 200, search: fileName });
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }
  const exists = (list || []).some(o => o.name === fileName);
  if (!exists) {
    return NextResponse.json({ error: 'object_not_found' }, { status: 404 });
  }

  // Compute next sort_order = current count.
  const { count } = await sb
    .from('boat_rental_boat_images')
    .select('id', { count: 'exact', head: true })
    .eq('boat_id', body.boatId);

  const { data: inserted, error: insertErr } = await sb
    .from('boat_rental_boat_images')
    .insert({
      boat_id: body.boatId,
      storage_path: body.path,
      sort_order: count || 0,
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message || 'insert_failed' }, { status: 500 });
  }
  const imageId = (inserted as { id: string }).id;

  // Best-effort AI classification — never fail the whole upload over
  // it. Storage URL is signed for the model to fetch.
  let category: string | null = null;
  try {
    const url = await signedImageUrl(body.path);
    if (url) category = await classifyBoatPhoto(url);
    if (category) {
      await sb.from('boat_rental_boat_images').update({ category }).eq('id', imageId);
    }
  } catch {
    // Swallow — admin can re-classify later via the backfill button.
  }

  revalidatePath(`/emails/boat-rental/admin/boats/${body.boatId}`);
  return NextResponse.json({ ok: true, category });
}
