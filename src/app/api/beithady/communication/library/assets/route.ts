import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { getListingAssets } from '@/lib/beithady/communication/listing-assets';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  const allowed =
    user.is_admin || (await hasBeithadyPermission(user, 'communication', 'read'));
  if (!allowed) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const listing = req.nextUrl.searchParams.get('listing');
  if (!listing) return NextResponse.json({ ok: false, error: 'missing_listing' }, { status: 400 });
  const assets = await getListingAssets(listing);
  return NextResponse.json({
    ok: true,
    assets: assets.map(a => ({
      id: a.id,
      public_url: a.public_url,
      thumbnail_url: a.thumbnail_url,
      caption: a.caption,
      mime_type: a.mime_type,
    })),
  });
}
