import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getArticle } from '@/lib/beithady/sop/queries';
import { renderArticleToPdf } from '@/lib/beithady/sop/pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  await requireBeithadyPermission('operations', 'read');
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

  const buf = await renderArticleToPdf(article);
  const safeName = slug.replace(/[^a-z0-9-]/gi, '_').slice(0, 80);
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="beithady-sop-${safeName}.pdf"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
}
