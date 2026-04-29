import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { getListingsInBuildingWithAssets } from '@/lib/beithady/communication/listing-assets';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  const allowed =
    user.is_admin || (await hasBeithadyPermission(user, 'communication', 'read'));
  if (!allowed) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const building = req.nextUrl.searchParams.get('building');
  if (!building) return NextResponse.json({ ok: false, error: 'missing_building' }, { status: 400 });
  const listings = await getListingsInBuildingWithAssets(building);
  return NextResponse.json({ ok: true, listings });
}
