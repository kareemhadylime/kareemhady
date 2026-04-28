import { NextResponse } from 'next/server';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { getCurrentUser } from '@/lib/auth';
import { generateItemTemplate } from '@/lib/beithady/inventory/excel';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !(await hasBeithadyPermission(user, 'inventory', 'read'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const buf = await generateItemTemplate();
  // NextResponse body type doesn't accept Node Buffer directly; wrap in Uint8Array.
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="beithady-inventory-items-template.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
