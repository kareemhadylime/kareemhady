import Link from 'next/link';
import { Inbox } from 'lucide-react';

export function Brand({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { icon: 18, text: 'text-base' },
    md: { icon: 22, text: 'text-lg' },
    lg: { icon: 32, text: 'text-2xl' },
  } as const;
  const s = sizes[size];
  return (
    <Link href="/" className="inline-flex items-center gap-2 group">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-500 text-white shadow-sm">
        <Inbox size={s.icon} strokeWidth={2.4} />
      </span>
      <span className={`font-bold tracking-tight ${s.text}`}>InboxOps</span>
    </Link>
  );
}

export function TopNav({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200/70">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Brand />
        <nav className="text-sm text-slate-600 flex items-center gap-4">{children}</nav>
      </div>
    </header>
  );
}
