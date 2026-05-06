'use client';

import { useState } from 'react';
import { CircleSlash, RotateCcw } from 'lucide-react';
import { setUserDisabledAction } from '../actions';

export function DisableToggle({
  userId,
  currentlyDisabled,
  username,
  isSelf,
}: {
  userId: string;
  currentlyDisabled: boolean;
  username: string;
  isSelf: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (isSelf) {
    // Don't render the toggle on the calling admin's own card.
    return null;
  }

  if (currentlyDisabled) {
    return (
      <form action={setUserDisabledAction}>
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="disabled" value="false" />
        <button
          type="submit"
          className="text-xs text-emerald-600 hover:text-emerald-800 inline-flex items-center gap-1"
        >
          <RotateCcw size={12} /> Re-enable account
        </button>
      </form>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-1"
      >
        <CircleSlash size={12} /> Disable account
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded p-2 flex-wrap">
      <span className="text-xs text-rose-900">
        Disable <strong>{username}</strong>? They&apos;ll be logged out and unable to sign in.
      </span>
      <form action={setUserDisabledAction}>
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="disabled" value="true" />
        <button
          type="submit"
          className="text-xs px-2 py-1 rounded bg-rose-600 text-white hover:bg-rose-700"
        >
          Confirm disable
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-slate-500 hover:text-slate-700"
      >
        Cancel
      </button>
    </div>
  );
}