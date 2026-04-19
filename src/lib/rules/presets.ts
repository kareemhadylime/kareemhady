export const DOMAINS = ['personal', 'kika', 'lime', 'fmplus', 'voltauto', 'beithady'] as const;

export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_LABELS: Record<Domain, string> = {
  personal: 'Personal',
  kika: 'KIKA',
  lime: 'LIME',
  fmplus: 'FMPLUS',
  voltauto: 'VOLTAUTO',
  beithady: 'BEITHADY',
};

export type RangePreset = 'today' | 'last24h' | 'last7d' | 'mtd' | 'ytd' | 'custom';

export const RANGE_PRESETS: Array<{ id: RangePreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'last24h', label: 'Last 24h' },
  { id: 'last7d', label: 'Last 7 days' },
  { id: 'mtd', label: 'Month to date' },
  { id: 'ytd', label: 'Year to date' },
];

export function resolvePreset(preset: RangePreset, now = new Date()): { fromIso: string; toIso: string; label: string } {
  const toIso = now.toISOString();
  let from: Date;
  let label: string;
  switch (preset) {
    case 'today':
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      label = 'Today';
      break;
    case 'last24h':
      from = new Date(now.getTime() - 24 * 3600 * 1000);
      label = 'Last 24h';
      break;
    case 'last7d':
      from = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      label = 'Last 7 days';
      break;
    case 'mtd':
      from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      label = 'Month to date';
      break;
    case 'ytd':
      from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      label = 'Year to date';
      break;
    case 'custom':
    default:
      from = new Date(now.getTime() - 24 * 3600 * 1000);
      label = 'Custom';
  }
  return { fromIso: from.toISOString(), toIso, label };
}

export function dateInputValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
