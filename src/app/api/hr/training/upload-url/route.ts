// src/app/api/hr/training/upload-url/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
const BUCKET = 'hr-training';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const recordId = searchParams.get('record_id');
  const filename = searchParams.get('filename');
  if (!recordId || !filename) {
    return NextResponse.json({ error: 'record_id and filename are required' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: rec, error: rErr } = await sb
    .from('hr_training_records')
    .select('employee_id')
    .eq('id', recordId)
    .single();
  if (rErr || !rec) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._\-()]/g, '_');
  const filePath = `${(rec as { employee_id: string }).employee_id}/${recordId}/${safeName}`;

  const { data, error: sErr } = await sb.storage.from(BUCKET).createSignedUploadUrl(filePath);
  if (sErr || !data) {
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, filePath, token: data.token });
}
