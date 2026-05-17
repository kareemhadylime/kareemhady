'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { markTikTokManualUploadedAction } from '../../../actions';

// Renders inline next to MANUAL_PREPARED rows. Opens a small inline form that
// asks for the share URL (operator pastes from TikTok app's "Copy link"),
// then flips status to MANUAL_UPLOADED via the server action.
export function MarkUploadedButton({ postId }: { postId: number }) {
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [pending, startTransition] = useTransition();

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set('post_id', String(postId));
    if (shareUrl) fd.set('share_url', shareUrl);
    startTransition(async () => {
      await markTikTokManualUploadedAction(fd);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ix-link text-[11px] inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"
      >
        <Check size={10} /> Mark uploaded
      </button>
    );
  }

  return (
    <form onSubmit={handleConfirm} className="inline-flex items-center gap-1">
      <input
        type="url"
        value={shareUrl}
        onChange={e => setShareUrl(e.target.value)}
        placeholder="TikTok share URL (optional)"
        className="ix-input text-[10px] w-44 py-0.5"
      />
      <button type="submit" disabled={pending} className="ix-btn-primary text-[10px] py-0.5 px-2">
        {pending ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
        Confirm
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-slate-500">cancel</button>
    </form>
  );
}
