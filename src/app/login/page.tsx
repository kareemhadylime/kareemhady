import Link from 'next/link';
import { Leaf, Lock, AlertTriangle } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; err?: string }>;
}) {
  const sp = await searchParams;
  // If already logged in, bounce to the intended target.
  const user = await getCurrentUser();
  if (user) {
    redirect(sp.next && sp.next.startsWith('/') ? sp.next : '/');
  }

  const next = sp.next && sp.next.startsWith('/') ? sp.next : '/';
  const err = sp.err || '';

  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-lime-50 via-white to-emerald-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-lime-500 to-emerald-600 text-white shadow-md shadow-lime-500/20">
              <Leaf size={28} strokeWidth={2.4} />
            </span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Lime Investments</h1>
          <p className="text-xs text-slate-500">
            Portfolio operations dashboard
          </p>
        </div>

        <form
          method="POST"
          action={`/api/auth/login?next=${encodeURIComponent(next)}`}
          className="ix-card p-6 space-y-4 bg-white/80 backdrop-blur"
        >
          {err && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <p>
                {err === 'invalid_credentials'
                  ? 'Wrong username or password.'
                  : err}
              </p>
            </div>
          )}

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-slate-700">
              Username
            </span>
            <input
              name="username"
              type="text"
              autoComplete="username"
              required
              autoFocus
              className="ix-input w-full"
              placeholder="you"
            />
          </label>

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-slate-700">
              Password
            </span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="ix-input w-full"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold bg-lime-600 text-white hover:bg-lime-700 transition shadow-sm"
          >
            <Lock size={14} />
            Sign in
          </button>
        </form>

        <p className="text-center text-[10px] text-slate-400">
          © Lime Investments · Holding company to Beithady · Kika · FMPLUS ·
          VoltAuto
        </p>
      </div>
    </main>
  );
}
