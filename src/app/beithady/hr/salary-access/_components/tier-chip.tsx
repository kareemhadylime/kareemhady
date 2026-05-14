// src/app/beithady/hr/salary-access/_components/tier-chip.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import type { SalaryAccessUser, SalaryTier } from '@/lib/beithady/hr/hr-salary-access-queries';
import { SALARY_TIERS } from '@/lib/beithady/hr/hr-salary-access-queries';
import { setSalaryAccessTierAction } from '@/lib/beithady/hr/hr-salary-access-actions';

type Props = {
  user: SalaryAccessUser;
  onTierChange: (userId: string, newTier: SalaryTier) => void;
};

function initials(username: string): string {
  const parts = username.split(/[\s._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return username.slice(0, 2).toUpperCase();
}

const ACCENT_BG: Record<string, string> = {
  slate:   'bg-slate-500',
  amber:   'bg-amber-500',
  orange:  'bg-orange-500',
  blue:    'bg-blue-500',
  emerald: 'bg-emerald-500',
};

export function TierChip({ user, onTierChange }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentTierDef = SALARY_TIERS[user.tier];

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function handleTierSelect(tier: SalaryTier) {
    if (tier === user.tier || busy) return;
    setBusy(true);
    setOpen(false);
    onTierChange(user.user_id, tier); // optimistic
    const result = await setSalaryAccessTierAction(user.user_id, tier);
    if (!result.ok) {
      // Revert on error
      onTierChange(user.user_id, user.tier);
    }
    setBusy(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={busy}
        className="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10 transition-colors disabled:opacity-50"
      >
        {/* Avatar */}
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${ACCENT_BG[currentTierDef.accent]}`}
        >
          {initials(user.username)}
        </span>
        {/* Name + role */}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-white leading-tight truncate">
            {user.username}
          </span>
          {user.position && (
            <span className="block text-[11px] text-white/50 truncate">{user.position}</span>
          )}
        </span>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-neutral-900 border border-white/10 rounded-xl shadow-xl p-2 min-w-[200px]">
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide px-2 pb-1">
            Set tier for {user.username}
          </p>
          {SALARY_TIERS.map(t => (
            <button
              key={t.tier}
              onClick={() => handleTierSelect(t.tier)}
              className={`flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-sm transition-colors ${
                t.tier === user.tier
                  ? 'bg-white/15 text-white font-semibold'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ACCENT_BG[t.accent]}`} />
              <span>
                T{t.tier} · {t.label}
              </span>
              {t.tier === user.tier && (
                <span className="ml-auto text-[10px] text-white/40">current</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
