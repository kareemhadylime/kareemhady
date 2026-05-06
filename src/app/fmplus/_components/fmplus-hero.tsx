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
      {/* Brand accent: gradient blur of the FM+ yellow → gold */}
      <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-gradient-to-br from-fmplus-yellow to-fmplus-gold opacity-[0.10] blur-3xl pointer-events-none" />
      <div className="flex items-start gap-4">
        {/* Icon box: yellow-tinted on light, gold-tinted on dark */}
        <div className="w-14 h-14 rounded-xl inline-flex items-center justify-center bg-fmplus-yellow/15 dark:bg-fmplus-gold/20 shrink-0">
          <Icon size={28} strokeWidth={2.2} className="text-fmplus-black dark:text-fmplus-yellow" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-fmplus-gold dark:text-fmplus-yellow font-semibold font-body">{eyebrow}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-0.5 font-serif">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-body">{subtitle}</p>
          )}
        </div>
        {showLogo && (
          <div className="hidden md:flex items-center shrink-0 self-start">
            {/* White card-within-card so the black FMPLUS wordmark + tagline
                stay readable on the dark hero surface. The color asset has
                yellow tiles + black M + black wordmark — designed for a
                light background. */}
            <div className="bg-white rounded-xl px-2.5 py-2 ring-1 ring-slate-900/5 shadow-sm">
              <FmplusLogo size="lg" variant="yellow-on-white" />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
