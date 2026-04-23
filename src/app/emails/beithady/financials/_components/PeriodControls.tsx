'use client';

import Link, { useLinkStatus } from 'next/link';
import {
  createContext,
  useContext,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Loader2 } from 'lucide-react';

// A preset tab (This month / Last month / This quarter / ...). Built on
// Next.js <Link>; useLinkStatus reports pending while the server is
// rendering the target page. We swap the label for a spinner so the user
// sees immediate feedback instead of wondering if the click registered.
function LinkSpinnerInner({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
        active
          ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
      } ${pending ? 'opacity-80 cursor-wait' : ''}`}
    >
      {pending && <Loader2 size={13} className="animate-spin" />}
      {pending ? 'Loading…' : label}
    </span>
  );
}

export function PeriodPresetLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href}>
      <LinkSpinnerInner label={label} active={active} />
    </Link>
  );
}

// A plain GET form's submit button (Go / Apply). useLinkStatus doesn't
// work for form submissions, so we track pending via the form's onSubmit
// handler. The browser still handles the navigation natively — we just
// show a spinner from the click until the new page mounts.
const PendingContext = createContext(false);

type PeriodSubmitFormProps = {
  children: ReactNode;
  className?: string;
};

export function PeriodSubmitForm({
  children,
  className,
}: PeriodSubmitFormProps) {
  const [pending, setPending] = useState(false);
  function handleSubmit(_e: FormEvent<HTMLFormElement>) {
    // Don't preventDefault — let the browser navigate. Just flip the
    // button into pending state until the new page mounts.
    setPending(true);
  }
  return (
    <form
      className={className}
      method="get"
      action=""
      onSubmit={handleSubmit}
      data-pending={pending}
    >
      <PendingContext.Provider value={pending}>
        {children}
      </PendingContext.Provider>
    </form>
  );
}

export function PeriodSubmitButton({
  label,
  variant = 'ghost',
}: {
  label: string;
  variant?: 'ghost' | 'primary';
}) {
  const pending = useContext(PendingContext);
  const base =
    variant === 'primary'
      ? 'px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium shadow-sm hover:bg-indigo-700 disabled:bg-indigo-500 disabled:cursor-wait'
      : 'px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-70 disabled:cursor-wait';
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${base} inline-flex items-center gap-1.5 transition`}
    >
      {pending ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </>
      ) : (
        label
      )}
    </button>
  );
}
