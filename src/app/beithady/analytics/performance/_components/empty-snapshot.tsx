import Link from 'next/link';
import { ManualRebuildButton } from './manual-rebuild-button';

type Props = { date: string };
export function EmptySnapshot({ date }: Props) {
  return (
    <div className="mx-auto max-w-md rounded-xl p-8 text-center" style={{ background: 'var(--bh-cream)', border: '1px solid var(--bh-mute)' }}>
      <div className="mb-3 text-3xl" aria-hidden="true">📭</div>
      <h2 className="text-xl font-semibold" style={{ color: 'var(--bh-ink)', fontFamily: 'var(--bh-heading)' }}>No snapshot for {date}</h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--bh-steel)' }}>
        The daily report cron hasn't produced a payload for this date yet, or the row is incomplete (admin-only rebuild reconstructs it from current Supabase / Stripe / Anthropic data).
      </p>
      <ManualRebuildButton date={date} />
      <p className="mt-4 text-xs" style={{ color: 'var(--bh-steel)' }}>
        Manage recipients + cron schedule on the{' '}
        <Link href="/beithady/setup" className="font-medium underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded" style={{ color: 'var(--bh-ink)' }}>
          setup panel
        </Link>.
      </p>
    </div>
  );
}
