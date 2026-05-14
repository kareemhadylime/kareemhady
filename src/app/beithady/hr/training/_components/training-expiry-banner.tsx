import { daysUntilExpiry } from '@/lib/beithady/hr/hr-documents-types';
import { RECORD_TYPE_LABELS, RECORD_TYPE_ICONS } from '@/lib/beithady/hr/hr-training-types';
import type { HrTrainingRecordRow, RecordType } from '@/lib/beithady/hr/hr-training-types';

type Props = { records: HrTrainingRecordRow[] };  // records expiring within 60 days

function RecordRow({ r }: { r: HrTrainingRecordRow }) {
  const days = daysUntilExpiry(r.expiry_date);
  const label = days === null ? '' : days < 0 ? `expired ${Math.abs(days)}d ago` : days === 0 ? 'expires today' : `expires in ${days}d`;
  const icon = RECORD_TYPE_ICONS[r.record_type as RecordType];
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium text-white">{r.employee_name}</span>
      <span className="text-white/50">·</span>
      <span className="text-white/70">{icon} {RECORD_TYPE_LABELS[r.record_type as RecordType]}: {r.title}</span>
      <span className="text-white/50">·</span>
      <span>{label}</span>
    </div>
  );
}

export function TrainingExpiryBanner({ records }: Props) {
  if (records.length === 0) return null;

  const critical = records.filter(r => { const n = daysUntilExpiry(r.expiry_date); return n !== null && n <= 7; });
  const warning  = records.filter(r => { const n = daysUntilExpiry(r.expiry_date); return n !== null && n > 7 && n <= 30; });
  const upcoming = records.filter(r => { const n = daysUntilExpiry(r.expiry_date); return n !== null && n > 30 && n <= 60; });

  return (
    <div className="rounded-xl border border-amber-700/30 bg-amber-950/20 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-amber-300">⚠️ Expiring Soon ({records.length})</h3>
      {critical.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">🔴 Critical — ≤7 days</p>
          {critical.map(r => <RecordRow key={r.id} r={r} />)}
        </div>
      )}
      {warning.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">🟡 Warning — 8–30 days</p>
          {warning.map(r => <RecordRow key={r.id} r={r} />)}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">🔵 Upcoming — 31–60 days</p>
          {upcoming.map(r => <RecordRow key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}
