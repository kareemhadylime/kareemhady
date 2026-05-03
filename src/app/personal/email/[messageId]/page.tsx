import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Archive } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { PersonalShell } from '../../_components/personal-shell';
import { ClassificationCard } from './_components/classification-card';
import { MoveDropdown } from './_components/move-dropdown';
import { archiveInGmail } from '../actions';
import type { CategorySlug } from '@/lib/personal-email/types';

export const dynamic = 'force-dynamic';

export default async function EmailDetailPage({
  params,
}: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('email_logs')
    .select(`
      id, gmail_message_id, gmail_thread_id, subject, from_address, to_address,
      received_at, body_excerpt, category, category_confidence, category_method,
      category_reason, last_classified_at, needs_review,
      accounts(id, email, display_name, oauth_refresh_token_encrypted)
    `)
    .eq('id', messageId)
    .single();
  if (error || !data) notFound();

  const acc = (data as any).accounts;
  const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${data.gmail_thread_id ?? data.gmail_message_id}`;

  return (
    <PersonalShell
      containerClass="max-w-3xl"
      breadcrumbs={[
        { label: 'Email', href: '/personal/email' },
        { label: data.subject?.slice(0, 40) ?? 'Message' },
      ]}
    >
      <header className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          {data.subject || '(no subject)'}
        </h1>
        <div className="text-xs text-slate-500 dark:text-slate-400 space-x-2">
          <span>From: {data.from_address}</span>
          <span>·</span>
          <span>To: {data.to_address}</span>
          <span>·</span>
          <span>{data.received_at && fmtCairoDateTime(data.received_at)}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {acc?.display_name ?? acc?.email}
          </span>
          <MoveDropdown emailId={data.id} current={data.category as CategorySlug | null} />
          <form action={async () => { 'use server'; await archiveInGmail([data.id]); }}>
            <button type="submit" className="ix-btn-secondary"><Archive size={14}/> Archive in Gmail</button>
          </form>
          <a href={gmailUrl} target="_blank" rel="noreferrer" className="ix-btn-secondary">
            <ExternalLink size={14}/> Open in Gmail
          </a>
        </div>
      </header>

      <ClassificationCard
        category={data.category}
        confidence={data.category_confidence as number | null}
        method={data.category_method}
        reason={data.category_reason}
        lastClassifiedAt={data.last_classified_at}
        needsReview={!!data.needs_review}
      />

      <section className="ix-card p-5 space-y-2">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
          Body excerpt
        </h2>
        <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200 font-sans leading-relaxed">
          {data.body_excerpt ?? '(no body cached — open in Gmail)'}
        </pre>
      </section>
    </PersonalShell>
  );
}
