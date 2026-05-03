import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { loadInbox } from '@/lib/personal-email/inbox-query';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { PersonalShell, PersonalHeader } from '../../_components/personal-shell';
import { AccountFilter } from '../_components/account-filter';

export const dynamic = 'force-dynamic';

export default async function NeedsReviewPage({
  searchParams,
}: { searchParams: Promise<{ account?: string }> }) {
  const sp = await searchParams;
  const rows = await loadInbox({
    accountId: sp.account,
    needsReviewOnly: true,
    limit: 500,
  });

  return (
    <PersonalShell breadcrumbs={[
      { label: 'Email', href: '/personal/email' },
      { label: 'Needs review' },
    ]}>
      <PersonalHeader
        eyebrow="Personal · Email"
        title={`Needs Review · ${rows.length}`}
        subtitle="Emails the AI was uncertain about (confidence below 0.7). Confirm or move them — your choice trains the next ingest run via few-shot."
        icon={AlertTriangle}
        right={<AccountFilter selected={sp.account} basePath="/personal/email/needs-review" />}
      />

      <div className="ix-card overflow-hidden">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(r => (
            <li key={r.id}>
              <Link href={`/personal/email/${r.id}`} className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm truncate">
                      <span className="font-semibold text-slate-900 dark:text-slate-50">
                        {r.from_address?.split('<')[0].trim() || '—'}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400"> · {r.subject || '(no subject)'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {r.account_display_name} · {r.received_at && fmtCairoDateTime(r.received_at)} · current: {r.category ?? '—'}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">
                    review
                  </span>
                </div>
              </Link>
            </li>
          ))}
          {!rows.length && (
            <li className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              All clear — nothing to review.
            </li>
          )}
        </ul>
      </div>
    </PersonalShell>
  );
}
