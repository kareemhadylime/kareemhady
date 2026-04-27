import Link from 'next/link';
import { Smartphone, Sparkles, ExternalLink } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getProviderEnabled, getProviderStatus } from '@/lib/credentials';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { ChannelTabs } from '../_components/channel-tabs';

export const dynamic = 'force-dynamic';

export default async function WaCasualPage() {
  await requireBeithadyPermission('communication', 'read');
  const [enabled, status] = await Promise.all([
    getProviderEnabled('green'),
    getProviderStatus('green'),
  ]);
  const configured = status.config_keys_set.length > 0 || status.has_env_fallback.length > 0;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Communication', href: '/emails/beithady/communication' },
      { label: 'WhatsApp Casual' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Communication"
        title="WhatsApp Casual (Green-API)"
        subtitle="Casual ongoing chat with established guests. Voice notes, file attachments, no template gating."
      />

      <ChannelTabs active="wa-casual" />

      <div className="ix-card p-10 text-center max-w-3xl mx-auto space-y-3">
        <div className="w-12 h-12 rounded-xl mx-auto inline-flex items-center justify-center bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
          <Smartphone size={24} strokeWidth={2.2} />
        </div>
        <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Sparkles size={16} className="text-cyan-600" />
          Phase C.2 coming up
        </h2>
        <p className="text-sm text-slate-500 max-w-xl mx-auto">
          Green-API outbound text already works (used by Boat Rental notifications today).
          Phase C.2 ships:
        </p>
        <ul className="text-xs text-slate-500 max-w-md mx-auto text-left list-disc pl-5 space-y-1">
          <li>Inbound webhook handler at <code>/api/webhooks/green/[slug]</code></li>
          <li>Conversation state mapped per phone number (<code>channel=&apos;wa_casual&apos;</code>)</li>
          <li><code>sendFileByUrl</code> + voice (browser <code>MediaRecorder</code> → Supabase Storage → URL → Green-API)</li>
          <li>Voice playback in the thread pane</li>
          <li>Booking deep-link button (opens Guesty&apos;s reservation create flow)</li>
        </ul>
        <p className="text-xs text-slate-500 max-w-md mx-auto pt-2">
          Provider status:{' '}
          <span className={enabled && configured ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
            {enabled && configured ? '✓ green-api configured + enabled' : '⚠ green-api not yet configured'}
          </span>
        </p>
        <Link href="/admin/integrations" className="ix-btn-secondary inline-flex">
          <ExternalLink size={14} /> Manage Green-API in Integrations
        </Link>
      </div>
    </BeithadyShell>
  );
}
