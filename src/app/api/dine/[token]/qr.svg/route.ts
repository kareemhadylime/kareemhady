import 'server-only';
import { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';

interface Ctx { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) return new Response('not_found', { status: 404 });

  const url = new URL(req.url);
  const target = `${url.origin}/dine/${token}`;
  const svg = await QRCode.toString(target, {
    type: 'svg',
    margin: 1,
    color: { dark: '#0F3F58', light: '#0000' },
    errorCorrectionLevel: 'M',
  });
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
