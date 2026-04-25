import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

// Section pages drop the TabNav in favor of returning to the launcher
// grid (the admin menu) for cross-section navigation. Same UX as a
// mobile-app drill-down.

export function BackToAdminMenu() {
  return (
    <Link
      href="/emails/boat-rental/admin"
      className="inline-flex items-center gap-1.5 mb-5 text-sm font-medium text-slate-500 hover:text-cyan-700 dark:text-slate-400 dark:hover:text-cyan-300 transition"
    >
      <ChevronLeft size={16} />
      Back to admin menu
    </Link>
  );
}
