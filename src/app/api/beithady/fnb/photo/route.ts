import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

// Minimal signed-URL preview endpoint for FnB item photos stored in
// the private beithady-gallery bucket.  The client passes ?path=<storage_path>
// and is redirected to a 1-hour signed URL.
export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const path = req.nextUrl.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path_required' }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .storage.from('beithady-gallery')
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'signed_url_failed' }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
