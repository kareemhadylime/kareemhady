'use client';

import { useState, useTransition } from 'react';
import { Download, Loader2, Check } from 'lucide-react';
import { prepareTikTokManualUploadAction } from '../../../actions';

// Path 4 — manual upload helper.
//
// On click:
//   1. Reads the surrounding form's current values (account, video URL, caption,
//      hashtags, etc.) and submits via the prepare action.
//   2. On success the server returns the formatted caption + video URL. We then:
//      a. Copy caption to clipboard (so the operator can paste into TikTok Studio).
//      b. Trigger a browser download of the video (anchor with `download` attr).
//      c. Open https://www.tiktok.com/upload in a new tab.
//   3. Surface a 4-step success banner so the operator sees what happened.
//
// The button submits the SAME form as the API publish button via formAction —
// so all the URL/caption/hashtag fields the operator already filled get sent
// without us duplicating any state. We just call a different server action.

export function ManualUploadButton() {
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const form = (e.currentTarget as HTMLButtonElement).closest('form') as HTMLFormElement | null;
    if (!form) {
      setError('form_not_found');
      return;
    }
    const fd = new FormData(form);

    // CRITICAL: open TikTok Studio FIRST, synchronously inside the click handler.
    // The browser's user-activation token expires after `await`, so any window.open
    // after the server call would be blocked as a popup. We open `about:blank` now,
    // then redirect the same tab to TikTok Studio once we're done.
    //
    // DO NOT pass 'noopener' — per the HTML spec it forces window.open to
    // return null, which would leave us with a blank tab we can't redirect.
    const studioTab = window.open('about:blank', '_blank');
    if (studioTab) {
      try {
        studioTab.document.open();
        studioTab.document.write('<!doctype html><meta charset="utf-8"><title>Preparing TikTok upload…</title><body style="font-family:system-ui;padding:2rem;color:#444">Loading TikTok Studio…</body>');
        studioTab.document.close();
      } catch { /* document access may be restricted in some configs — placeholder is cosmetic */ }
    }

    startTransition(async () => {
      try {
        const res = await prepareTikTokManualUploadAction(fd);
        if (!res.ok) {
          setError(res.error);
          if (studioTab) studioTab.close();
          return;
        }

        // 1. Copy caption to clipboard (best-effort; safe to fail silently)
        try {
          await navigator.clipboard.writeText(res.formatted_caption);
        } catch { /* clipboard may be restricted; caption is still in DB */ }

        // 2. Trigger video download. The server passed `download: filename` to
        // createSignedUrl, so Supabase returns Content-Disposition: attachment.
        // That makes the browser save the file instead of navigating to it.
        const a = document.createElement('a');
        a.href = res.video_url;
        a.download = ''; // attribute presence is what matters; filename comes from CD header
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();

        // 3. Now redirect the pre-opened tab to TikTok Studio
        if (studioTab) studioTab.location.href = 'https://www.tiktok.com/upload';

        setSuccess(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'prepare_failed');
        if (studioTab) studioTab.close();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-slate-500 disabled:opacity-50"
        title="Downloads the video + copies the caption + opens TikTok Studio so you can post by hand"
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        {pending ? 'Preparing…' : 'Prepare for manual upload'}
      </button>

      {success && (
        <div className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded p-2 max-w-xs">
          <div className="flex items-center gap-1 font-semibold mb-1"><Check size={12} /> Ready to upload</div>
          <ol className="list-decimal list-inside space-y-0.5 text-[10px]">
            <li>Video downloading to your computer</li>
            <li>Caption + hashtags copied to clipboard</li>
            <li>TikTok Studio opened in new tab</li>
            <li>Drag video in, paste caption, click Post</li>
          </ol>
          <p className="mt-1 text-[10px] text-slate-500">When done, click &quot;Mark uploaded&quot; on the post row below.</p>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-rose-600 dark:text-rose-300">prepare failed: {error}</p>
      )}
    </div>
  );
}
