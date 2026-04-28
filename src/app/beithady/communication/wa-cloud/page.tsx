import Link from 'next/link';
import { Bot, Sparkles, ExternalLink } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { ChannelTabs } from '../_components/channel-tabs';

export const dynamic = 'force-dynamic';

export default async function WaCloudPage() {
  await requireBeithadyPermission('communication', 'read');

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Communication', href: '/beithady/communication' },
      { label: 'WhatsApp Cloud' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Communication"
        title="WhatsApp Cloud (official Meta WABA)"
        subtitle="Business-grade messaging via Meta WhatsApp Business Cloud API. Templates, 24h-window discipline, AI auto-reply target."
      />

      <ChannelTabs active="wa-cloud" />

      <div className="ix-card p-10 text-center max-w-3xl mx-auto space-y-3">
        <div className="w-12 h-12 rounded-xl mx-auto inline-flex items-center justify-center bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
          <Bot size={24} strokeWidth={2.2} />
        </div>
        <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Sparkles size={16} className="text-emerald-600" />
          Beit Hady WABA setup needed
        </h2>
        <p className="text-sm text-slate-500 max-w-xl mx-auto">
          Per Plan v0.3 Q-C, Beit Hady gets its <strong>own</strong> Meta WhatsApp Business Account
          (separate phone number, separate Business Manager asset) — distinct from the Voltauto
          WABA at <code>+20 10 11 300 300</code>. Setup requires:
        </p>
        <ol className="text-xs text-slate-500 max-w-md mx-auto text-left list-decimal pl-5 space-y-1">
          <li>Create Beit Hady asset in Meta Business Manager</li>
          <li>Provision a phone number (cannot already be on regular WhatsApp)</li>
          <li>Verify the business + display name</li>
          <li>Generate System User token with <code>whatsapp_business_messaging</code></li>
          <li>Save credentials in Settings → Integrations (provider <code>meta_waba</code>)</li>
          <li>Click "Verify webhook" to wire <code>/api/webhooks/wa-cloud</code></li>
        </ol>
        <Link href="/beithady/settings/integrations" className="ix-btn-primary inline-flex">
          <ExternalLink size={14} /> Configure WABA in Integrations
        </Link>
      </div>
    </BeithadyShell>
  );
}
