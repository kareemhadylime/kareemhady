import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

const Body = z.object({
  filename: z.string().regex(/^[\w\-.]+\.(jpg|jpeg|png|webp|heic)$/i),
  size_bytes: z.coerce.number().int().positive().max(5 * 1024 * 1024),
});

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const parsedResult = Body.safeParse(await req.json());
  if (!parsedResult.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsedResult.error.issues }, { status: 400 });
  }
  const parsed = parsedResult.data;

  const sb = supabaseAdmin();
  const ext = parsed.filename.split('.').pop()!.toLowerCase();
  const path = `fnb/items/${id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { data, error } = await sb.storage
    .from('beithady-gallery')
    .createSignedUploadUrl(path);

  if (error) {
    console.error('[fnb/items/[id]/photo-upload-url] storage error:', error);
    return NextResponse.json({ error: 'storage_error' }, { status: 500 });
  }

  return NextResponse.json({
    upload_url: data.signedUrl,
    storage_path: path,
    bucket: 'beithady-gallery',
    expires_in_seconds: 300,
  });
}
