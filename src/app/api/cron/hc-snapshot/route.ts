import { saveSnapshot } from '@/lib/beithady/hc-estimator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    await saveSnapshot();
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[hc-snapshot]', err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
