'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const ACTIVE = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
const INACTIVE = 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400';

const PLATFORMS: Array<{ key: 'meta' | 'google' | 'tiktok'; label: string }> = [
  { key: 'meta', label: 'Meta' },
  { key: 'google', label: 'Google' },
  { key: 'tiktok', label: 'TikTok' },
];

export function AudienceFilters({
  campaigns,
}: {
  campaigns: Array<{ id: number; name: string; platform: 'meta' | 'google' | 'tiktok' }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const campaign = sp.get('campaign') ?? '';
  const selectedPlatforms = (sp.get('platforms') ?? '').split(',').filter(Boolean);

  function push(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function togglePlatform(k: string) {
    const set = new Set(selectedPlatforms);
    if (set.has(k)) set.delete(k); else set.add(k);
    push({ platforms: set.size ? Array.from(set).join(',') : null });
  }

  return (
    <div className="ix-card p-3 flex flex-wrap items-center gap-3 text-xs">
      <label className="inline-flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Campaign</span>
        <select
          aria-label="campaign"
          value={campaign}
          onChange={e => push({ campaign: e.target.value || null })}
          className="ix-input !min-h-0 !py-1 text-xs"
        >
          <option value="">All campaigns</option>
          {campaigns.map(c => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
      </label>
      <span className="text-slate-300 dark:text-slate-700">|</span>
      <span className="text-[10px] uppercase tracking-wide text-slate-400">Platforms</span>
      {PLATFORMS.map(p => {
        const isOn = selectedPlatforms.includes(p.key) || selectedPlatforms.length === 0;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => togglePlatform(p.key)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${isOn ? ACTIVE : INACTIVE}`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
