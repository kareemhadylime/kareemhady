import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';

const Body = z.object({ lang: z.enum(['en', 'ar', 'ru', 'fr']) });

interface Ctx { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) return NextResponse.json({ error: c.reason }, { status: 403 });
  const { lang } = Body.parse(await req.json());
  // v1: no-op (client uses ?lang= query). Future: persist to dine_session_prefs.
  return NextResponse.json({ ok: true, lang });
}
