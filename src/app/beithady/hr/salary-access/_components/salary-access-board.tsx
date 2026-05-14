// src/app/beithady/hr/salary-access/_components/salary-access-board.tsx
'use client';

import { useState } from 'react';
import { Lock, Eye } from 'lucide-react';
import { TierChip } from './tier-chip';
import { SALARY_TIERS } from '@/lib/beithady/hr/hr-salary-access-types';
import type { SalaryAccessUser, SalaryTier } from '@/lib/beithady/hr/hr-salary-access-types';

type Props = {
  initialUsers: SalaryAccessUser[];
};

const TILE_BG: Record<string, string> = {
  slate:   'bg-slate-800/60 border-slate-700/50',
  amber:   'bg-amber-950/40 border-amber-700/30',
  orange:  'bg-orange-950/40 border-orange-700/30',
  blue:    'bg-blue-950/40 border-blue-700/30',
  emerald: 'bg-emerald-950/40 border-emerald-700/30',
};

const TILE_HEADER_TEXT: Record<string, string> = {
  slate:   'text-slate-300',
  amber:   'text-amber-300',
  orange:  'text-orange-300',
  blue:    'text-blue-300',
  emerald: 'text-emerald-300',
};

const TILE_BADGE: Record<string, string> = {
  slate:   'bg-slate-700 text-slate-300',
  amber:   'bg-amber-900/60 text-amber-300',
  orange:  'bg-orange-900/60 text-orange-300',
  blue:    'bg-blue-900/60 text-blue-300',
  emerald: 'bg-emerald-900/60 text-emerald-300',
};

export function SalaryAccessBoard({ initialUsers }: Props) {
  const [users, setUsers] = useState<SalaryAccessUser[]>(initialUsers);

  function handleTierChange(userId: string, newTier: SalaryTier) {
    setUsers(prev =>
      prev.map(u => u.user_id === userId ? { ...u, tier: newTier } : u)
    );
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      {SALARY_TIERS.map(tierDef => {
        const tierUsers = users.filter(u => u.tier === tierDef.tier);
        return (
          <div
            key={tierDef.tier}
            className={`rounded-2xl border p-4 flex flex-col gap-3 ${TILE_BG[tierDef.accent]}`}
          >
            {/* Tile header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  {tierDef.tier === 0 ? (
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-white/40" />
                  )}
                  <span className={`text-[11px] font-bold uppercase tracking-widest ${TILE_HEADER_TEXT[tierDef.accent]}`}>
                    T{tierDef.tier}
                  </span>
                </div>
                <p className={`text-sm font-semibold ${TILE_HEADER_TEXT[tierDef.accent]}`}>
                  {tierDef.label}
                </p>
                <p className="text-[11px] text-white/35 mt-0.5">{tierDef.sublabel}</p>
              </div>
              <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TILE_BADGE[tierDef.accent]}`}>
                {tierUsers.length}
              </span>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/8" />

            {/* User chips */}
            <div className="flex flex-col gap-1 min-h-[48px]">
              {tierUsers.length === 0 ? (
                <p className="text-[12px] text-white/25 italic px-2">No users</p>
              ) : (
                tierUsers.map(u => (
                  <TierChip
                    key={u.user_id}
                    user={u}
                    onTierChange={handleTierChange}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
