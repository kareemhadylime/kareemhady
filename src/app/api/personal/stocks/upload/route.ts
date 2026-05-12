// POST /api/personal/stocks/upload — multipart upload of one or more AOLB
// XML/.xls statement files. Admin-only. Each file is parsed + imported via
// importAolbFile; per-file errors are reported in the results array rather
// than aborting the whole batch.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { importAolbFile } from '@/lib/personal/stocks/import';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const form = await req.formData();
  const files = form.getAll('files');
  if (!files.length) return NextResponse.json({ error: 'no files' }, { status: 400 });

  const client = supabaseAdmin();
  const results: Array<Record<string, unknown>> = [];
  for (const f of files) {
    if (!(f instanceof File)) continue;
    const xml = await f.text();
    try {
      const r = await importAolbFile({ filename: f.name, xml, client, uploadedBy: user.username });
      results.push({ filename: f.name, ...r });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ filename: f.name, status: 'parse_error', message });
    }
  }
  return NextResponse.json({ results });
}
