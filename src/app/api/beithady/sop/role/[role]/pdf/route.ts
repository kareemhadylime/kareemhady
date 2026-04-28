import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { renderRoleBundleToPdf } from '@/lib/beithady/sop/pdf';
import { ROLE_LABEL_EN, ROLE_LABEL_AR, type SopRole, type SopArticleDetail } from '@/lib/beithady/sop/queries';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const VALID_ROLES = new Set(['reception', 'guest_relations', 'housekeeping', 'maintenance', 'upselling', 'all']);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ role: string }> },
) {
  await requireBeithadyPermission('operations', 'read');
  const { role } = await params;
  if (!VALID_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: 'invalid role' }, { status: 400 });
  }
  const lang = req.nextUrl.searchParams.get('lang');
  const language: 'en' | 'ar' | undefined = lang === 'en' || lang === 'ar' ? lang : undefined;

  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_sop_articles')
    .select('id, slug, title, summary, body_md, language, kind, role, subcategory, tags, version, status, published_at, updated_at, checklist_items')
    .eq('status', 'published')
    .order('kind')
    .order('title');
  if (role === 'all') {
    // Cross-role bundle = all roles
  } else {
    q = q.in('role', [role, 'all']);
  }
  if (language) q = q.eq('language', language);

  const { data } = await q;
  type DBRow = {
    id: string; slug: string; title: string; summary: string | null; body_md: string;
    language: 'en' | 'ar'; kind: 'sop' | 'checklist' | 'kb'; role: SopRole;
    subcategory: 'transportation' | 'excursions' | 'f_b' | 'affiliations' | null;
    tags: string[]; version: number; status: 'draft' | 'published' | 'archived';
    published_at: string | null; updated_at: string;
    checklist_items: Array<{ id?: string; text: string; photo_required?: boolean }> | null;
  };
  const rows = (data as DBRow[] | null) || [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: 'no published articles for this role' }, { status: 404 });
  }

  const articles: SopArticleDetail[] = rows.map(r => ({
    ...r,
    acknowledged_by_me: false,
    ack_count: 0,
  }));

  const roleSlug = role as SopRole;
  const roleLabel = language === 'ar' ? ROLE_LABEL_AR[roleSlug] : ROLE_LABEL_EN[roleSlug];

  const buf = await renderRoleBundleToPdf({
    roleSlug,
    roleLabel,
    language,
    articles,
  });

  const filename = `beithady-sop-${roleSlug}${language ? `-${language}` : ''}.pdf`;
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
}
