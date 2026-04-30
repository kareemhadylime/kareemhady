// GET /api/beithady/reports/templates — list quick-template seeds.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { TEMPLATE_META, templateConfig, type TemplateKey } from '@/lib/beithady/reports/templates';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'read'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const keys = Object.keys(TEMPLATE_META) as TemplateKey[];
  const templates = keys.map(k => ({
    key: k,
    ...TEMPLATE_META[k],
    config: templateConfig(k),
  }));
  return NextResponse.json({ templates });
}
