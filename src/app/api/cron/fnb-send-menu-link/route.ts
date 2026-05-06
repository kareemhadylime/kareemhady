import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import {
  sendMenuLinkToGuest,
  sendMenuLinksToEligibleGuests,
} from '@/lib/beithady/fnb/send-menu-link';

export const dynamic = 'force-dynamic';

// "Always send menu app access details by guest's recorded WhatsApp number."
//
// Two modes:
//   - GET /api/cron/fnb-send-menu-link
//       Batch — finds all eligible boarding passes (checked-in guest at an
//       F&B-enabled building, menu link not yet sent) and fires the WA
//       message. Idempotent via beithady_boarding_passes.menu_link_sent_at.
//       Designed to be called from Vercel cron every ~5 min.
//   - GET /api/cron/fnb-send-menu-link?token=<token>[&resend=1]
//       Single — sends to one boarding pass. Used by ops to demo / re-send.
//       resend=1 bypasses the idempotency stamp.
//
// Auth: Bearer ${CRON_SECRET} required (no force-bypass — sending real WA
// messages to user phones is a privileged action).
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const token = req.nextUrl.searchParams.get('token');
  const resend = req.nextUrl.searchParams.get('resend') === '1';

  if (token) {
    const result = await sendMenuLinkToGuest(token, { resend });
    const status = result.ok ? 200 : result.reason === 'token_not_found' ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  const batch = await sendMenuLinksToEligibleGuests();
  return NextResponse.json(batch);
}
