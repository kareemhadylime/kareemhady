'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './theme-provider';

// Tri-state cycle: light → dark → system → light. Compact size suitable
// for TopNav. Icon reflects current setting (not resolved).

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const label = theme === 'light' ? 'Light theme' : theme === 'dark' ? 'Dark theme' : 'System theme';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`${label} — click to switch`}
      aria-label={label}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition ${className}`}
    >
      <Icon size={16} />
    </button>
  );
}
