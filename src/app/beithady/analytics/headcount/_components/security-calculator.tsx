'use client';
import { useState, useMemo } from 'react';
import type { SecurityBuildingConfig } from '@/lib/beithady/hc-estimator-types';
import { BUILDINGS } from '@/lib/beithady/hc-estimator-types';
import { calculateSecurity } from '@/lib/beithady/hk-calc';
import { SecurityBuildingCard } from './security-building-card';
import { SecurityDashboard } from './security-dashboard';

const DEFAULT_CONFIGS: SecurityBuildingConfig[] = BUILDINGS.map(b => ({
  building: b,
  posts: [],
}));

export function SecurityCalculator() {
  const [configs, setConfigs] = useState<SecurityBuildingConfig[]>(DEFAULT_CONFIGS);

  const updateBuilding = (updated: SecurityBuildingConfig) =>
    setConfigs(prev => prev.map(c => c.building === updated.building ? updated : c));

  const result = useMemo(() => calculateSecurity(configs), [configs]);

  return (
    <div className="space-y-6">
      <SecurityDashboard result={result} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {configs.map(c => (
          <SecurityBuildingCard key={c.building} config={c} onChange={updateBuilding} />
        ))}
      </div>
    </div>
  );
}
