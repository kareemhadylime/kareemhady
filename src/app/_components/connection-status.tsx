'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

// Renders a small fixed pill at the top when the browser is offline.
// Hidden when online. Sits below the TopNav (z lower than modals).

export function ConnectionStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online) return null;
  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800 shadow">
        <WifiOff size={12} />
        Offline · showing cached data
      </div>
    </div>
  );
}
