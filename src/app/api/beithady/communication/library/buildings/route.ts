import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { getAssetBuildingsSummary } from '@/lib/beithady/communication/listing-assets';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  const allowed =
    user.is_admin || (await hasBeithadyPermission(user, 'communication', 'read'));
  if (!allowed) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const buildings = await getAssetBuildingsSummary();
  return NextResponse.json({ ok: true, buildings });
}
