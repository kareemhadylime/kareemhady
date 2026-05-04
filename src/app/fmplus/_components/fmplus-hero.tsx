import type { LucideIcon } from 'lucide-react';
import { FmplusLogo } from './fmplus-logo';

interface FmplusHeroProps {
  /** Eyebrow text, e.g. "FMPLUS · PROJECT BUDGET" */
  eyebrow: string;
  /** Main h1 title, e.g. "Project Budget" */
  title: string;
  /** Subtitle / description paragraph */
  subtitle?: string;
  /** Lucide icon to render in the colored box on the left */
  icon: LucideIcon;
  /** Whether to show the FM+ wordmark on the right side. Default true. */
  showLogo?: boolean;
}

export function FmplusHero({ eyebrow, title, subtitle, icon: Icon, showLogo = true }: FmplusHeroProps) {
  return (
    <header className="relative ix-card p-6 overflow-hidden">
      <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 opacity-[0.08] blur-3xl pointer-events-none" />
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl inline-flex items-center justify-center bg-amber-50 dark:bg-amber-950 shrink-0">
          <Icon size={28} strokeWidth={2.2} className="text-amber-700 dark:text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-400 font-semibold">{eyebrow}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-0.5">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{subtitle}</p>
          )}
        </div>
        {showLogo && (
          <div className="hidden md:flex items-center shrink-0 self-start mt-1.5 opacity-90">
            <FmplusLogo size="lg" />
          </div>
        )}
      </div>
    </header>
  );
}
