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

    startTransition(async () => {
      try {
        const res = await prepareTikTokManualUploadAction(fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }

        // 1. Copy caption to clipboard
        try {
          await navigator.clipboard.writeText(res.formatted_caption);
        } catch {
          // Some browsers block clipboard outside user gestures or in iframes;
          // it's fine, the caption is still in the DB and visible on the page.
        }

        // 2. Trigger video download — anchor with download attr
        const a = document.createElement('a');
        a.href = res.video_url;
        // Hint the filename; browsers honour this for same-origin or CORS-allowed
        // responses. Cross-origin without CORS will navigate instead of download,
        // but Supabase public URLs respond with the right headers.
        const fileName = (res.video_url.split('/').pop() || 'tiktok-video.mp4').split('?')[0];
        a.download = fileName;
        a.target = '_blank';   // fallback: open in new tab if download attr is ignored
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();

        // 3. Open TikTok Studio in another new tab
        window.open('https://www.tiktok.com/upload', '_blank', 'noopener');

        setSuccess(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'prepare_failed');
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
