import Link from 'next/link';
import { loadInbox } from '@/lib/personal-email/inbox-query';
import { fmtCairoDateTime } from '@/lib/fmt-date';
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
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-4 flex-1">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/personal/email" className="ix-link text-sm">← Back</Link>
          <h1 className="text-2xl font-bold">Needs Review · {rows.length}</h1>
          <p className="text-xs text-slate-500">AI confidence below 0.7 — please confirm or move.</p>
        </div>
        <AccountFilter selected={sp.account} basePath="/personal/email/needs-review" />
      </header>

      <div className="ix-card divide-y divide-slate-100">
        {rows.map(r => (
          <Link
            key={r.id}
            href={`/personal/email/${r.id}`}
            className="block px-4 py-2.5 hover:bg-slate-50"
          >
            <div className="text-sm">
              <span className="font-medium">{r.from_address?.split('<')[0].trim()}</span>
              {' · '}{r.subject}
            </div>
            <div className="text-[11px] text-slate-500">
              {r.account_display_name} · {r.received_at && fmtCairoDateTime(r.received_at)} · current category: {r.category ?? '—'}
            </div>
          </Link>
        ))}
        {!rows.length && (
          <div className="p-8 text-center text-sm text-slate-500">All clear — nothing to review.</div>
        )}
      </div>
    </main>
  );
}
