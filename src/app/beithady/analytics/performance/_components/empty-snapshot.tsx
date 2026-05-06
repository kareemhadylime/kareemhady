type Props = { date: string };
export function EmptySnapshot({ date }: Props) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-[#003462]/10 bg-white p-8 text-center">
      <div className="mb-3 text-3xl">📭</div>
      <h2 className="text-xl font-semibold text-[#003462]" style={{ fontFamily: 'var(--bh-heading)' }}>No snapshot for {date}</h2>
      <p className="mt-2 text-sm text-[#6077a6]">
        The daily report cron hasn't produced a payload for this date yet. The next run is at 09:00 Cairo.
      </p>
      <a
        href="/api/cron/beithady-daily-report?force=1"
        className="mt-4 inline-block rounded-md border border-[#003462] bg-[#003462] px-4 py-2 text-sm font-medium text-white hover:bg-[#003462]/90"
      >
        Run now manually →
      </a>
    </div>
  );
}
