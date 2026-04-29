import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

// Phase R.4 — mobile fullscreen layout for the inbox split-pane pages.
// On `< lg` (1024px) viewports, when a conversation is selected via
// ?c=<id> we hide the sidebar and let the ThreadPane take over the
// entire viewport. The 100dvh + sticky composer pattern handles iOS
// Safari's collapsing address bar so the composer stays anchored to
// the bottom even when the keyboard pops.

export function MobileFullscreenLayout({
  selectedId,
  basePath,
  preservedQuery,
  sidebar,
  threadPane,
}: {
  selectedId: string | null | undefined;
  basePath: string;
  preservedQuery?: string;
  sidebar: React.ReactNode;
  threadPane: React.ReactNode;
}) {
  const hasSelection = !!selectedId;

  // Build the back href: same page minus c=…, preserving the rest of
  // the query so filters survive the back gesture.
  const backHref = preservedQuery ? `${basePath}?${preservedQuery}` : basePath;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:h-[640px]">
      {/* Sidebar — hidden on mobile when a conversation is selected */}
      <div className={`overflow-y-auto ${hasSelection ? 'hidden lg:block' : ''}`}>
        {sidebar}
      </div>

      {/* Thread pane — fullscreen on mobile when selected */}
      <div
        className={`
          lg:h-[640px] lg:static lg:z-auto
          ${hasSelection
            ? 'fixed inset-0 z-40 bg-white dark:bg-slate-900 flex flex-col'
            : 'hidden lg:block'}
        `}
        style={hasSelection ? { height: '100dvh' } : undefined}
      >
        {/* Mobile back button — only on mobile, only when a conv is selected */}
        {hasSelection && (
          <div className="lg:hidden sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center px-2 py-2">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
              aria-label="Back to inbox list"
            >
              <ChevronLeft size={18} />
              Inbox
            </Link>
          </div>
        )}
        <div className={hasSelection ? 'flex-1 overflow-hidden' : 'h-full'}>
          {threadPane}
        </div>
      </div>
    </section>
  );
}
