import {
  ListChecks,
  Users as UsersIcon,
  Palette,
  Plug,
  Sparkles,
  FileText,
  Tag,
  ListPlus,
  History,
} from 'lucide-react';
import { requireBeithadyPermission, canAccessSettingsSubtab, getEffectiveBeithadyRoles } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { BeithadyLauncher, type LauncherTile } from '../_components/beithady-launcher';

export const dynamic = 'force-dynamic';

type Subtab = {
  slug: string;
  tile: LauncherTile;
};

const SUBTABS: Subtab[] = [
  {
    slug: 'rules',
    tile: {
      href: '/admin/rules?domain=beithady',
      title: 'Email rules',
      description: 'Gmail-derived aggregates that feed the morning report. Full CRUD lives in /admin/rules.',
      icon: ListChecks,
      accent: 'slate',
    },
  },
  {
    slug: 'users',
    tile: {
      href: '/emails/beithady/settings/users',
      title: 'Users & roles',
      description: 'Assign one of 5 Beithady roles per user — guest_relations · finance · ops · manager · admin.',
      icon: UsersIcon,
      accent: 'amber',
    },
  },
  {
    slug: 'branding',
    tile: {
      href: '/emails/beithady/settings/branding',
      title: 'Branding',
      description: 'Logo, color palette, and font choices applied across all Beit Hady pages.',
      icon: Palette,
      accent: 'violet',
    },
  },
  {
    slug: 'integrations',
    tile: {
      href: '/admin/integrations',
      title: 'Integrations',
      description: 'Guesty · PriceLabs · Green-API · Meta WABA · Meta Marketing · Google Ads — credential health pings.',
      icon: Plug,
      accent: 'cyan',
      badge: { label: 'Admin only', tone: 'gold' },
    },
  },
  {
    slug: 'ai-config',
    tile: {
      href: '/emails/beithady/settings/ai-config',
      title: 'AI configuration',
      description: 'Auto-reply confidence threshold · master kill-switch · VIP digest opt-in. Phase E owns the model.',
      icon: Sparkles,
      accent: 'gold',
    },
  },
  {
    slug: 'templates',
    tile: {
      href: '/emails/beithady/settings/templates',
      title: 'Templates',
      description: 'Guesty saved replies · WABA approved templates · pre-arrival checklists per building · upsell catalog.',
      icon: FileText,
      accent: 'emerald',
      badge: { label: 'Phase C/F', tone: 'gold' },
    },
  },
  {
    slug: 'tags',
    tile: {
      href: '/emails/beithady/settings/tags',
      title: 'Tags',
      description: 'Guest tags + conversation tags taxonomy. Power segments and SLA color coding.',
      icon: Tag,
      accent: 'rose',
      badge: { label: 'Phase B', tone: 'gold' },
    },
  },
  {
    slug: 'custom-fields',
    tile: {
      href: '/emails/beithady/settings/custom-fields',
      title: 'Custom fields',
      description: 'Extend the guest profile with arbitrary fields (anniversary, dietary, accessibility, ...).',
      icon: ListPlus,
      accent: 'indigo',
      badge: { label: 'Phase B', tone: 'gold' },
    },
  },
  {
    slug: 'audit',
    tile: {
      href: '/emails/beithady/settings/audit',
      title: 'Audit log',
      description: 'Every CRM edit · auto-sent reply · ad publish · gallery upload · settings change — searchable.',
      icon: History,
      accent: 'slate',
    },
  },
];

export default async function BeithadySettingsPage() {
  const { user, roles } = await requireBeithadyPermission('settings', 'read');
  const effective = await getEffectiveBeithadyRoles(user);

  const visible = SUBTABS.filter(s => canAccessSettingsSubtab(effective, s.slug, user.is_admin)).map(s => s.tile);

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Settings' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Settings"
        title="Settings"
        subtitle="Permissions, integrations, AI guardrails, templates, branding, and audit."
        right={
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{user.username}</span>
            <div>roles: {roles.length ? roles.join(' · ') : 'none'}</div>
          </div>
        }
      />

      <BeithadyLauncher tiles={visible} columns={3} />
    </BeithadyShell>
  );
}
