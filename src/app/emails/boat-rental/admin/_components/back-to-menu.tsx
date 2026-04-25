import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

// Section pages drop the TabNav in favor of returning up one level for
// cross-section navigation. Defaults send back to the top admin menu;
// the setup sub-pages override to point back at /admin/setup.

export function BackToAdminMenu({
  href = '/emails/boat-rental/admin',
  label = 'Back to admin menu',
}: {
  href?: string;
  label?: string;
} = {}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 mb-5 text-sm font-medium text-slate-500 hover:text-cyan-700 dark:text-slate-400 dark:hover:text-cyan-300 transition"
    >
      <ChevronLeft size={16} />
      {label}
    </Link>
  );
}
