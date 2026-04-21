import { NextRequest, NextResponse } from 'next/server';
import { listGuestyListings, listGuestyReservations } from '@/lib/guesty';

// Smoke-test endpoint for the Guesty Open API integration. Returns auth
// status + a tiny sample of listings and reservations so we can verify
// the credentials and rate limits are working.
//
// Protected by CRON_SECRET (same bearer pattern as the daily cron):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://kareemhady.vercel.app/api/guesty/ping

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured on server' },
      { status: 500 }
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const hasClientId = !!process.env.GUESTY_CLIENT_ID;
  const hasClientSecret = !!process.env.GUESTY_CLIENT_SECRET;
  const hasAccountId = !!process.env.GUESTY_ACCOUNT_ID;
  if (!hasClientId || !hasClientSecret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Guesty credentials missing — set GUESTY_CLIENT_ID and GUESTY_CLIENT_SECRET. GUESTY_ACCOUNT_ID is optional and will be auto-detected from the API response on first successful call.',
        env: {
          GUESTY_CLIENT_ID: hasClientId,
          GUESTY_CLIENT_SECRET: hasClientSecret,
          GUESTY_ACCOUNT_ID: hasAccountId,
        },
      },
      { status: 400 }
    );
  }

  const started = Date.now();
  try {
    const [listingsRes, reservationsRes] = await Promise.all([
      listGuestyListings({
        limit: 5,
        fields: '_id nickname title active listingType accountId',
      }),
      listGuestyReservations({
        limit: 5,
        sort: '-createdAt',
        fields:
          '_id confirmationCode status source listingId accountId guest.fullName checkInDateLocalized checkOutDateLocalized nightsCount money.hostPayout money.currency integration.platform integration.confirmationCode createdAt',
      }),
    ]);

    // Auto-detect accountId from first record — lets the user skip the
    // GUESTY_ACCOUNT_ID env var during bootstrap. Guesty stamps accountId
    // on most documents.
    const detectedAccountId =
      ((listingsRes.results || [])[0] as { accountId?: string } | undefined)?.accountId ||
      ((reservationsRes.results || [])[0] as { accountId?: string } | undefined)?.accountId ||
      null;

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - started,
      account_id:
        process.env.GUESTY_ACCOUNT_ID ||
        detectedAccountId ||
        null,
      detected_account_id: detectedAccountId,
      account_id_source: process.env.GUESTY_ACCOUNT_ID
        ? 'env'
        : detectedAccountId
          ? 'auto-detected from API response'
          : 'not found',
      listings: {
        count_returned: listingsRes.results?.length ?? 0,
        total_count: listingsRes.count,
        sample: (listingsRes.results || []).map(l => ({
          _id: l._id,
          nickname: l.nickname,
          title: l.title,
          active: l.active,
          listingType: l.listingType,
        })),
      },
      reservations: {
        count_returned: reservationsRes.results?.length ?? 0,
        total_count: reservationsRes.count,
        sample: (reservationsRes.results || []).map(r => ({
          _id: r._id,
          confirmationCode: r.confirmationCode,
          status: r.status,
          source: r.source,
          guest: r.guest?.fullName || null,
          checkIn: r.checkInDateLocalized,
          checkOut: r.checkOutDateLocalized,
          nights: r.nightsCount,
          hostPayout: r.money?.hostPayout,
          currency: r.money?.currency,
          airbnb_code: r.integration?.confirmationCode || null,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        duration_ms: Date.now() - started,
        error: String(e?.message || e),
      },
      { status: 500 }
    );
  }
}
