import Image from 'next/image';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { submitCsatAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function CsatPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_csat_responses')
    .select('id, building_code, expires_at, responded_at')
    .eq('token', token)
    .maybeSingle();
  if (!data) notFound();
  const r = data as { id: string; building_code: string | null; expires_at: string; responded_at: string | null };
  const expired = new Date(r.expires_at).getTime() < Date.now();

  return (
    <div style={{ backgroundColor: '#F5F1E8', minHeight: '100vh' }}>
      <div className="max-w-md mx-auto px-5 py-10 space-y-6">
        <header className="text-center space-y-2">
          <div className="relative w-32 h-16 mx-auto">
            <Image src="/brand/beithady/Wordmark-03.png" alt="Beit Hady" fill className="object-contain" sizes="128px" priority />
          </div>
        </header>

        {sp.ok === '1' && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 text-center space-y-2">
            <Heart size={24} className="mx-auto text-emerald-600" />
            <h2 className="text-lg font-bold" style={{ color: 'var(--bh-navy, #1E2D4A)' }}>Thank you!</h2>
            <p className="text-sm text-slate-600">
              Your feedback is on its way to the team. We read every response.
            </p>
          </div>
        )}

        {!sp.ok && r.responded_at && (
          <div className="rounded-2xl bg-white p-6 text-center space-y-2">
            <p className="text-sm" style={{ color: 'var(--bh-navy, #1E2D4A)' }}>
              You already responded — thank you!
            </p>
          </div>
        )}

        {!sp.ok && !r.responded_at && expired && (
          <div className="rounded-2xl bg-white p-6 text-center space-y-2">
            <p className="text-sm text-slate-600">
              This survey link has expired. <Link href="/" className="underline">Beit Hady</Link>
            </p>
          </div>
        )}

        {!sp.ok && !r.responded_at && !expired && (
          <form action={submitCsatAction} className="rounded-2xl bg-white shadow-sm p-6 space-y-4">
            <h1 className="text-xl font-bold text-center" style={{ color: 'var(--bh-navy, #1E2D4A)', fontFamily: 'Cormorant Garamond, Playfair Display, ui-serif, Georgia, serif' }}>
              How likely are you to recommend Beit Hady to a friend?
            </h1>
            <input type="hidden" name="token" value={token} />

            <div className="grid grid-cols-11 gap-1 select-none">
              {Array.from({ length: 11 }, (_, i) => (
                <label key={i} className="cursor-pointer">
                  <input type="radio" name="nps" value={i} className="peer sr-only" required />
                  <div
                    className="aspect-square rounded-lg flex items-center justify-center text-sm font-bold transition peer-checked:ring-2 peer-checked:ring-slate-700"
                    style={{
                      backgroundColor: i <= 6 ? '#FECACA' : i <= 8 ? '#FEF3C7' : '#A7F3D0',
                      color: i <= 6 ? '#991B1B' : i <= 8 ? '#92400E' : '#065F46',
                    }}
                  >
                    {i}
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0 · Not likely</span>
              <span>10 · Extremely likely</span>
            </div>

            <label className="block">
              <span className="block text-sm font-semibold mb-1" style={{ color: 'var(--bh-navy, #1E2D4A)' }}>
                What stood out — good or bad? (optional)
              </span>
              <textarea
                name="comment"
                rows={4}
                maxLength={2000}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="The team would love your honest take…"
              />
            </label>

            {sp.error && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                {sp.error}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-lg font-semibold py-3 text-white"
              style={{ backgroundColor: 'var(--bh-navy, #1E2D4A)' }}
            >
              Send feedback
            </button>
          </form>
        )}

        <footer className="text-center text-[10px] pt-2" style={{ color: '#5F7397' }}>
          Beit Hady · A Lime Investments subsidiary
        </footer>
      </div>
    </div>
  );
}
