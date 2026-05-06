import Link from 'next/link';

type Props = { date: string };
export function EmptySnapshot({ date }: Props) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-[#003462]/10 bg-white p-8 text-center">
      <div className="mb-3 text-3xl" aria-hidden="true">📭</div>
      <h2 className="text-xl font-semibold text-[#003462]" style={{ fontFamily: 'var(--bh-heading)' }}>No snapshot for {date}</h2>
      <p className="mt-2 text-sm text-[#6077a6]">
        The daily report cron hasn't produced a payload for this date yet. The next run is at 09:00 Cairo.
      </p>
      <p className="mt-4 text-xs text-[#6077a6]/80">
        Trigger a manual snapshot rebuild from the{' '}
        <Link href="/beithady/setup" className="font-medium text-[#003462] underline underline-offset-2 hover:text-[#003462]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2 rounded">
          setup panel
        </Link>.
      </p>
    </div>
  );
}
