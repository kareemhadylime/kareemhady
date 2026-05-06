import { AlertTriangle } from 'lucide-react';
import { loadInbox, loadSelectedEmail } from '@/lib/personal-email/inbox-query';
import { PersonalShell, PersonalHeader } from '../../_components/personal-shell';
import { AccountFilter } from '../_components/account-filter';
import { DrillDownView } from '../_components/drill-down-view';

export const dynamic = 'force-dynamic';

export default async function NeedsReviewPage({
  searchParams,
}: { searchParams: Promise<{ account?: string; msg?: string }> }) {
  const sp = await searchParams;
  const [rows, selected] = await Promise.all([
    loadInbox({
      accountId: sp.account,
      needsReviewOnly: true,
      limit: 500,
    }),
    sp.msg ? loadSelectedEmail(sp.msg) : Promise.resolve(null),
  ]);

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

      {/* Reuses the same master-detail UI as the category drill-down so
          checkboxes, the bulk-action bar (Mark read / Archive / Move to /
          Clear), and the preview pane all work here too. `category` is
          omitted because needs-review rows span every category — the
          Move-to dropdown shows all options. */}
      <DrillDownView rows={rows} selected={selected} />

      {!rows.length && (
        <div className="ix-card p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          All clear — nothing to review.
        </div>
      )}
    </PersonalShell>
  );
}
