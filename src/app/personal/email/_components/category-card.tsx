import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { CategoryDef } from '@/lib/personal-email/categories';
import type { InboxRow } from '@/lib/personal-email/inbox-query';
import { fmtCairoDateTime } from '@/lib/fmt-date';

export function CategoryCard({
  cat, count, top3, basePath,
}: {
  cat: CategoryDef;
  count: number;
  top3: InboxRow[];
  basePath: string;
}) {
  const accent = cat.accentColor;
  return (
    <Link
      href={`${basePath}?category=${cat.slug}`}
      className="ix-card p-4 hover:shadow-md transition block"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-wide text-${accent}-700`}>
            {cat.displayName}
          </span>
          <span className={`text-xs font-mono px-1.5 py-0.5 rounded bg-${accent}-50 text-${accent}-700`}>
            {count}
          </span>
        </div>
        <ChevronRight size={14} className="text-slate-400" />
      </div>
      <ul className="text-xs text-slate-600 space-y-0.5">
        {top3.slice(0, 3).map(r => (
          <li key={r.id} className="truncate">
            {r.from_address?.split('<')[0].trim()} · {r.subject}
            {r.received_at && (
              <span className="text-slate-400 ml-1">· {fmtCairoDateTime(r.received_at)}</span>
            )}
          </li>
        ))}
        {count > 3 && <li className="text-slate-400">+ {count - 3} more</li>}
      </ul>
    </Link>
  );
}
