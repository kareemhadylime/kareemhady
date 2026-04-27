import { MessageCircle, Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';

export const dynamic = 'force-dynamic';

export default async function BeithadyCommunicationPage() {
  await requireBeithadyPermission('communication', 'read');

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Communication' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Communication"
        title="Communication"
        subtitle="Unified inbox across Guesty (Airbnb / Booking / Direct) and dual WhatsApp (Cloud + Casual)."
      />

      <div className="ix-card p-10 text-center max-w-2xl mx-auto space-y-3">
        <div className="w-12 h-12 rounded-xl mx-auto inline-flex items-center justify-center bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
          <MessageCircle size={24} strokeWidth={2.2} />
        </div>
        <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Sparkles size={16} className="text-cyan-600" />
          Phase C coming up
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Three sub-tabs: Guesty Inbox · WhatsApp Cloud (official Meta WABA) ·
          WhatsApp Casual (Green-API). SLA color coding, voice record/playback,
          gallery attachments, AI auto-reply with confidence threshold, and a
          deep-link button to create direct bookings in Guesty.
        </p>
      </div>
    </BeithadyShell>
  );
}
