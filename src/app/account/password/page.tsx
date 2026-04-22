import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { TopNav } from '@/app/_components/brand';
import { changePasswordAction } from './actions';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'All three fields are required.',
  mismatch: 'New password and confirmation do not match.',
  too_short: 'New password must be at least 10 characters.',
  same_password: 'New password must be different from the current one.',
  wrong_current: 'Current password is incorrect.',
};

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?next=/account/password');
  }
  const sp = await searchParams;
  const err = sp.err ? ERROR_MESSAGES[sp.err] || sp.err : '';
  const ok = sp.ok === '1';

  return (
    <>
      <TopNav>
        <Link href="/" className="ix-link">Home</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Account</span>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Password</span>
      </TopNav>

      <main className="max-w-xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Account · {user.username}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Change password</h1>
          <p className="text-sm text-slate-500 mt-1">
            Rotating your password signs out every other device. This session
            stays signed in.
          </p>
        </header>

        {ok && (
          <div className="ix-card p-4 flex items-start gap-3 border-emerald-200 bg-emerald-50/50">
            <CheckCircle2
              size={18}
              className="text-emerald-600 shrink-0 mt-0.5"
            />
            <div className="text-sm">
              <p className="font-medium text-emerald-800">Password updated.</p>
              <p className="text-emerald-700/80 text-xs mt-0.5">
                Other sessions have been signed out.
              </p>
            </div>
          </div>
        )}

        {err && (
          <div className="ix-card p-4 flex items-start gap-3 border-rose-200 bg-rose-50/50">
            <AlertTriangle
              size={18}
              className="text-rose-600 shrink-0 mt-0.5"
            />
            <p className="text-sm text-rose-800">{err}</p>
          </div>
        )}

        <form
          action={changePasswordAction}
          className="ix-card p-6 space-y-4"
        >
          <label className="block space-y-1">
            <span className="block text-xs font-medium text-slate-700">
              Current password
            </span>
            <input
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
              className="ix-input w-full"
              placeholder="••••••••"
            />
          </label>

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-slate-700">
              New password
            </span>
            <input
              name="new_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              className="ix-input w-full"
              placeholder="at least 10 characters"
            />
          </label>

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-slate-700">
              Confirm new password
            </span>
            <input
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              className="ix-input w-full"
              placeholder="••••••••"
            />
          </label>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-lime-600 text-white hover:bg-lime-700 transition shadow-sm"
            >
              <Lock size={14} />
              Update password
            </button>
            <Link
              href="/"
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </Link>
          </div>
        </form>

        <div className="text-[11px] text-slate-400 border-t border-slate-200 pt-4">
          Passwords are hashed with scrypt (N=16384, r=8, p=1) before storage.
          We never see your plaintext password.
        </div>
      </main>
    </>
  );
}
