import {
  Calculator,
  TrendingUp,
  Users,
  MessageCircle,
  Settings as SettingsIcon,
  Image as ImageIcon,
  Megaphone,
  ShieldOff,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getEffectiveBeithadyRoles, visibleCategoriesFor, type BeithadyCategory } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from './_components/beithady-shell';
import { BeithadyLauncher, type LauncherTile } from './_components/beithady-launcher';

export const dynamic = 'force-dynamic';

const CATEGORY_TILES: Record<BeithadyCategory, LauncherTile> = {
  financial: {
    href: '/emails/beithady/financial',
    title: 'Financial',
    description: 'Daily Performance Report · Consolidated P&L · Payouts · Vendors / Owners / Employee payables.',
    icon: Calculator,
    accent: 'slate',
    badge: { label: 'Odoo + Guesty', tone: 'navy' },
  },
  analytics: {
    href: '/emails/beithady/analytics',
    title: 'Analytics',
    description: 'Pricing Intelligence · Bookings · Reviews · Inquiries · Requests · Market intelligence (coming soon).',
    icon: TrendingUp,
    accent: 'emerald',
    badge: { label: 'PriceLabs + Guesty', tone: 'navy' },
  },
  crm: {
    href: '/emails/beithady/crm',
    title: 'CRM',
    description: 'Guests 360° · Segments · Loyalty tiers · Tasks · Pipeline. Hospitality-tuned, Guesty-synced.',
    icon: Users,
    accent: 'amber',
    badge: { label: 'Phase B', tone: 'gold' },
  },
  communication: {
    href: '/emails/beithady/communication',
    title: 'Communication',
    description: 'Guesty inbox · WhatsApp Cloud (official) · WhatsApp Casual · AI auto-reply with confidence threshold.',
    icon: MessageCircle,
    accent: 'cyan',
    badge: { label: 'Phase C', tone: 'gold' },
  },
  settings: {
    href: '/emails/beithady/settings',
    title: 'Settings',
    description: 'Email rules · Users & roles · Branding · Integrations · AI config · Templates · Audit log.',
    icon: SettingsIcon,
    accent: 'slate',
  },
  gallery: {
    href: '/emails/beithady/gallery',
    title: 'Gallery',
    description: 'Pictures · videos · documents · brand library — organized by building and apartment.',
    icon: ImageIcon,
    accent: 'violet',
    badge: { label: 'Phase D', tone: 'gold' },
  },
  ads: {
    href: '/emails/beithady/ads',
    title: 'Ads',
    description: 'Meta + Google + TikTok campaigns · Click-to-WhatsApp lead funnel · AI ad copy generator.',
    icon: Megaphone,
    accent: 'gold',
    badge: { label: 'Phase H', tone: 'gold' },
  },
};

// Phases B–H ship as separate stub pages today; show them disabled in
// the launcher so the user sees the full destination map.
const PHASE_PENDING: Record<BeithadyCategory, string | undefined> = {
  financial: undefined,
  analytics: undefined,
  crm: 'Phase B',
  communication: 'Phase C',
  settings: undefined,
  gallery: 'Phase D',
  ads: 'Phase H',
};

export default async function BeithadyHome() {
  const user = await getCurrentUser();
  const roles = user ? await getEffectiveBeithadyRoles(user) : [];
  const visible = visibleCategoriesFor(roles);

  // Order: Financial → Analytics → CRM → Communication → Settings → Gallery → Ads
  const order: BeithadyCategory[] = [
    'financial',
    'analytics',
    'crm',
    'communication',
    'settings',
    'gallery',
    'ads',
  ];
  const tiles: LauncherTile[] = order
    .filter(c => visible.includes(c))
    .map(c => {
      const base = CATEGORY_TILES[c];
      const phaseLabel = PHASE_PENDING[c];
      // Phases not yet shipped beyond a stub still link through, but
      // the stub page will say "coming soon". We don't disable the
      // tile — that prevents the user from peeking at the placeholder.
      return phaseLabel
        ? { ...base, badge: { label: phaseLabel, tone: 'gold' } }
        : base;
    });

  return (
    <BeithadyShell>
      <BeithadyHeader
        eyebrow="Subsidiary cockpit"
        title="Beit Hady"
        subtitle="Serviced apartments — Egypt + Dubai. 91 units across BH-26 · BH-73 · BH-435 · BH-OK · BH-34."
        showWordmark
      />

      {tiles.length === 0 ? (
        <div className="ix-card p-10 text-center max-w-xl mx-auto">
          <ShieldOff size={28} className="mx-auto text-amber-600" />
          <h2 className="mt-3 text-lg font-semibold">No Beit Hady role assigned</h2>
          <p className="text-sm text-slate-500 mt-1">
            You have access to the Beit Hady domain but no specific role yet. Ask
            an admin to grant you a role at{' '}
            <code className="text-xs">/emails/beithady/settings/users</code>.
          </p>
        </div>
      ) : (
        <BeithadyLauncher tiles={tiles} />
      )}

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — A Lime Investments subsidiary. Powered by FM+
      </footer>
    </BeithadyShell>
  );
}
