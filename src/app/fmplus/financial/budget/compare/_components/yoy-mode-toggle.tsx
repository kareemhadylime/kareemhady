'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface Props {
  mode: 'projects' | 'yoy';
}

export function YoyModeToggle({ mode }: Props) {
  const params = useSearchParams();
  const service = params.get('service') ?? 'hk';

  return (
    <div className="inline-flex bg-bg-secondary border border-border rounded-lg p-0.5 gap-0.5">
      <Link href={`?mode=projects&service=${service}`}
        className={`px-3 py-1 text-xs font-semibold rounded ${mode === 'projects' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}>
        Cross-project
      </Link>
      <Link href={`?mode=yoy&service=${service}`}
        className={`px-3 py-1 text-xs font-semibold rounded ${mode === 'yoy' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}>
        Year-vs-Year
      </Link>
    </div>
  );
}
