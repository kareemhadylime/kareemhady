'use client';
import { Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm) {
          setConfirm(true);
          setTimeout(() => setConfirm(false), 3000);
          return;
        }
        start(async () => {
          const res = await fetch(`/api/beithady/reports/${reportId}`, {
            method: 'DELETE',
          });
          if (res.ok) router.refresh();
        });
      }}
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
        confirm
          ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-300'
          : 'bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
      } ${pending ? 'opacity-50' : ''}`}
      title={confirm ? 'Click again to confirm' : 'Delete'}
    >
      <Trash2 size={12} />
      {confirm ? <span className="ml-1">Confirm</span> : null}
    </button>
  );
}
