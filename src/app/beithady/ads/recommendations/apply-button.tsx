'use client';

import { useFormStatus } from 'react-dom';
import { Sparkles, Info, Loader2 } from 'lucide-react';

export function ApplyButton({ canApply }: { canApply: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`text-xs inline-flex items-center gap-1.5 ${canApply ? 'ix-btn-primary' : 'ix-btn-secondary'} ${pending ? 'opacity-60 cursor-wait' : ''}`}
    >
      {pending ? (
        <>
          <Loader2 size={11} className="animate-spin" />
          Applying…
        </>
      ) : canApply ? (
        <>
          <Sparkles size={11} />
          Apply now
        </>
      ) : (
        <>
          <Info size={11} />
          Why manual?
        </>
      )}
    </button>
  );
}
