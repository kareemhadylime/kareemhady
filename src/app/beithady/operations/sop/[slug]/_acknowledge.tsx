'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { acknowledgeArticleAction } from '../actions';

export function AcknowledgeButton({ articleId, version }: { articleId: string; version: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const r = await acknowledgeArticleAction({ articleId, version });
      if (r.ok) router.refresh();
      else alert(`Failed: ${r.error}`);
    });
  };

  return (
    <button
      type="button"
      onClick={submit}
      disabled={pending}
      className="ix-btn-primary !text-[11px] !py-1 inline-flex items-center gap-1"
    >
      {pending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
      Mark as read
    </button>
  );
}
