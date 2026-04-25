'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

// One-time, dismissible "Add to Home Screen" prompt that appears on the
// second meaningful visit. Listens for the `beforeinstallprompt` event
// (Chromium / Android) and triggers the native flow on user click.
// On iOS Safari the browser doesn't fire this event — we surface a
// short instruction-only toast there.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'install-prompt-dismissed';
const VISIT_COUNT_KEY = 'install-prompt-visits';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS PWA flag, modern API, or display-mode media query.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((navigator as any).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches;
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [iosTip, setIosTip] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY) === '1') return;

    const visits = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(VISIT_COUNT_KEY, String(visits));
    if (visits < 2) return;

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS Safari fallback — show an instruction tip on second visit.
    if (isIos()) {
      const tipShown = localStorage.getItem('install-prompt-ios-shown');
      if (!tipShown) {
        setIosTip(true);
        setVisible(true);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, '1');
    if (iosTip) localStorage.setItem('install-prompt-ios-shown', '1');
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm z-40 safe-pb">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-300 inline-flex items-center justify-center shrink-0">
          <Download size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
            {iosTip ? 'Add to Home Screen' : 'Install Boat Rental'}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {iosTip
              ? 'Tap the Share button, then "Add to Home Screen" to use as an app.'
              : 'Get app-like speed and a home-screen icon. No App Store needed.'}
          </p>
          {!iosTip && (
            <button
              type="button"
              onClick={install}
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-700 transition"
            >
              Install
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
