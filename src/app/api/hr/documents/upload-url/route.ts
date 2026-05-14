// src/app/api/hr/documents/upload-url/route.ts
// Returns a signed upload URL so the client can PUT a file directly to Supabase Storage.
// The doc must already exist (created by addDocumentAction) before calling this route.

import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const BUCKET = 'hr-documents';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const docId    = searchParams.get('doc_id');
  const filename = searchParams.get('filename');
  if (!docId || !filename) {
    return NextResponse.json({ error: 'doc_id and filename are required' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: doc, error: dErr } = await sb
    .from('hr_employee_documents')
    .select('employee_id')
    .eq('id', docId)
    .single();
  if (dErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._\-()]/g, '_');
  const filePath = `${(doc as { employee_id: string }).employee_id}/${docId}/${safeName}`;

  const { data, error: sErr } = await sb.storage.from(BUCKET).createSignedUploadUrl(filePath);
  if (sErr || !data) {
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, filePath, token: data.token });
}
