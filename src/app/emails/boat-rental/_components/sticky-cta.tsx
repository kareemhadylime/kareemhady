// Bottom-pinned action bar visible only on mobile (<md). Sits above the
// bottom navigation bar (which is also <md only). Page containers
// should add appropriate bottom padding.

export function StickyCta({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="md:hidden fixed inset-x-0 z-30 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur safe-pb"
      style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
        {children}
      </div>
    </div>
  );
}

// Variant for pages without bottom nav (admin sub-pages).
export function StickyCtaBare({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur safe-pb">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
        {children}
      </div>
    </div>
  );
}
