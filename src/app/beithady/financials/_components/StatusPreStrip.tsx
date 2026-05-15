// Note: red/amber hex literals on the variance + due cards are used
// semantically for danger/warn accents — preserved byte-for-byte from
// the previous bespoke implementation in financials/page.tsx. Brand-var
// migration tracked under audit §7.2 brand-var sweep follow-up.

type Props = {
  active: { period_end: string; version: number; frozen_at: string | null } | null;
  openVariance: number;
  openVarCount: number;
  next: { period_end: string; due_by: string; is_overdue: boolean } | null;
};

export function StatusPreStrip({ active, openVariance, openVarCount, next }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Active snapshot — BH-themed (cream surface, gold accent on heading) */}
      <div
        className="rounded-lg p-3"
        style={{
          background: 'var(--bh-cream)',
          border: '1px solid var(--bh-mute)',
        }}
      >
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-1"
          style={{ color: 'var(--bh-gold)' }}
        >
          Active snapshot
        </div>
        <div className="text-base font-semibold" style={{ color: 'var(--bh-ink)' }}>
          {active ? `${active.period_end} v${active.version}` : 'No frozen snapshot'}
        </div>
        <div className="text-xs" style={{ color: 'var(--bh-steel)' }}>
          {active?.frozen_at
            ? `Consolidated · frozen ${active.frozen_at.slice(0, 10)}`
            : '—'}
        </div>
      </div>

      {/* Open variance — semantic danger accent (red), inherited hex literals */}
      <div
        className="rounded-lg p-3"
        style={{
          background: '#fdecec',
          border: '1px solid #f1bcbc',
        }}
      >
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-1"
          style={{ color: '#9a2828' }}
        >
          Open variance
        </div>
        <div className="text-base font-semibold" style={{ color: '#9a2828' }}>
          {Math.round(openVariance).toLocaleString('en-US')} EGP
        </div>
        <div className="text-xs" style={{ color: 'var(--bh-steel)' }}>
          {openVarCount} account{openVarCount === 1 ? '' : 's'}
        </div>
      </div>

      {/* Next snapshot due — semantic warn accent (amber), inherited hex literals */}
      <div
        className="rounded-lg p-3"
        style={{
          background: '#fdf3da',
          border: '1px solid #f1d889',
        }}
      >
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-1"
          style={{ color: '#7a5300' }}
        >
          Next snapshot due
        </div>
        <div className="text-base font-semibold" style={{ color: 'var(--bh-ink)' }}>
          {next ? next.period_end : 'All current'}
        </div>
        <div className="text-xs" style={{ color: 'var(--bh-steel)' }}>
          {next
            ? `${next.is_overdue ? 'Overdue · ' : ''}due by ${next.due_by}`
            : '—'}
        </div>
      </div>
    </div>
  );
}
