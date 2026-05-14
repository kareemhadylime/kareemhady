import { DOC_TYPE_LABELS, daysUntilExpiry } from '@/lib/beithady/hr/hr-documents-types';
import type { HrDocumentRow, DocType } from '@/lib/beithady/hr/hr-documents-types';

type Props = { docs: HrDocumentRow[] };  // docs expiring within 60 days

export function ExpiringBanner({ docs }: Props) {
  if (docs.length === 0) return null;

  const critical = docs.filter(d => { const n = daysUntilExpiry(d.expiry_date); return n !== null && n <= 7; });
  const warning  = docs.filter(d => { const n = daysUntilExpiry(d.expiry_date); return n !== null && n > 7 && n <= 30; });
  const upcoming = docs.filter(d => { const n = daysUntilExpiry(d.expiry_date); return n !== null && n > 30 && n <= 60; });

  function DocRow({ d }: { d: HrDocumentRow }) {
    const days = daysUntilExpiry(d.expiry_date);
    const label = days === null ? '' : days < 0 ? `expired ${Math.abs(days)}d ago` : days === 0 ? 'expires today' : `expires in ${days}d`;
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-white">{d.employee_name}</span>
        <span className="text-white/50">·</span>
        <span className="text-white/70">{DOC_TYPE_LABELS[d.doc_type as DocType]}</span>
        <span className="text-white/50">·</span>
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-700/30 bg-amber-950/20 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-amber-300">⚠️ Expiring Documents ({docs.length})</h3>
      {critical.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">🔴 Critical — ≤7 days</p>
          {critical.map(d => <DocRow key={d.id} d={d} />)}
        </div>
      )}
      {warning.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">🟡 Warning — 8–30 days</p>
          {warning.map(d => <DocRow key={d.id} d={d} />)}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">🔵 Upcoming — 31–60 days</p>
          {upcoming.map(d => <DocRow key={d.id} d={d} />)}
        </div>
      )}
    </div>
  );
}
