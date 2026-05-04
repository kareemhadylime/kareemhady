'use client';

export function OrderFilters({
  filters, setFilters, buildings,
}: {
  filters: { buildings: string[]; date_from: string; date_to: string };
  setFilters: (f: { buildings: string[]; date_from: string; date_to: string }) => void;
  buildings: Array<{ building_code: string; enabled: boolean }>;
}) {
  return (
    <div className="ix-card p-3 mb-3 flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1">
        {buildings.map(b => {
          const checked = filters.buildings.includes(b.building_code);
          return (
            <button
              key={b.building_code}
              onClick={() => setFilters({
                ...filters,
                buildings: checked
                  ? filters.buildings.filter(x => x !== b.building_code)
                  : [...filters.buildings, b.building_code],
              })}
              className={`text-xs px-2 py-1 rounded ${checked ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800'} ${!b.enabled ? 'opacity-50' : ''}`}
              title={!b.enabled ? 'F&B disabled for this building' : ''}
            >{b.building_code}</button>
          );
        })}
      </div>
      <div className="ml-auto text-xs text-slate-500">
        Auto-refreshes every 8 sec
      </div>
    </div>
  );
}
