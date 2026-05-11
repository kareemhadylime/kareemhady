import Link from 'next/link';
import { MessageSquareText } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AdsTabs } from '../_components/ads-tabs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function TemplatesPage() {
  await requireBeithadyPermission('ads', 'read');
  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Templates' }]} containerClass="max-w-4xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="WhatsApp templates & greetings"
        subtitle="CTWA auto-greet templates and cold-outreach flow templates. Send via the existing WhatsApp pipeline."
      />

      <AdsTabs active="templates" />

      <section className="ix-card p-5 space-y-3 text-sm">
        <h2 className="font-semibold flex items-center gap-2"><MessageSquareText size={14} /> Greeting + cold-outreach flow</h2>
        <p className="text-xs text-slate-500">
          The CTWA auto-greet and the WhatsApp flow state machine ship with Phase H. Editing the templates from this tab is a follow-up — for now, manage WhatsApp content under
          {' '}<Link className="ix-link" href="/beithady/communication">/beithady/communication</Link>.
        </p>
        <div className="border border-slate-200 dark:border-slate-700 rounded-md p-4 text-xs space-y-2 bg-slate-50 dark:bg-slate-900">
          <div><strong>Default greeting:</strong> <span className="text-slate-500">English + Arabic, sent on first inbound from a CTWA ad.</span></div>
          <div><strong>Cold-outreach prompts:</strong> <span className="text-slate-500">Defined inline in the cold-outreach flow JSON (state machine). Stored in <code>wa_flow_state</code>.</span></div>
          <div><strong>Message log:</strong> <span className="text-slate-500">Full audit at <code>wa_messages_log</code>; surface in <Link className="ix-link" href="/beithady/communication">communication inbox</Link>.</span></div>
        </div>
      </section>
    </BeithadyShell>
  );
}
