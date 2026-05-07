import Link from 'next/link';

type Props = { date: string };
export function EmptySnapshot({ date }: Props) {
  return (
    <div className="mx-auto max-w-md rounded-xl p-8 text-center" style={{ background: 'var(--bh-cream)', border: '1px solid var(--bh-mute)' }}>
      <div className="mb-3 text-3xl" aria-hidden="true">📭</div>
      <h2 className="text-xl font-semibold" style={{ color: 'var(--bh-ink)', fontFamily: 'var(--bh-heading)' }}>No snapshot for {date}</h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--bh-steel)' }}>
        The daily report cron hasn't produced a payload for this date yet. The next run is at 09:00 Cairo.
      </p>
      <p className="mt-4 text-xs" style={{ color: 'var(--bh-steel)' }}>
        Trigger a manual snapshot rebuild from the{' '}
        <Link href="/beithady/setup" className="font-medium underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded" style={{ color: 'var(--bh-ink)' }}>
          setup panel
        </Link>.
      </p>
    </div>
  );
}
