import { setImpersonationAction } from '@/app/_actions/impersonation';

type Props = {
  impersonatedUsername: string;
  originalAdminUsername: string;
  redirectTo?: string;
};

export function ImpersonationBanner({
  impersonatedUsername,
  originalAdminUsername,
  redirectTo = '/',
}: Props) {
  return (
    <>
      {/* Amber stripe at top of viewport */}
      <div
        aria-hidden
        className="fixed top-0 left-0 right-0 h-1 bg-amber-500 z-50"
      />
      {/* Banner */}
      <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 px-4 py-2 text-sm text-amber-900 dark:text-amber-200 flex items-center justify-between flex-wrap gap-2">
        <span>
          🎭 Acting as <strong>@{impersonatedUsername}</strong> — you are{' '}
          <strong>@{originalAdminUsername}</strong>
        </span>
        <form action={setImpersonationAction}>
          <input type="hidden" name="target_user_id" value="" />
          <input type="hidden" name="redirect_to" value={redirectTo} />
          <button
            type="submit"
            className="text-xs font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline"
          >
            Stop acting as @{impersonatedUsername}
          </button>
        </form>
      </div>
    </>
  );
}
