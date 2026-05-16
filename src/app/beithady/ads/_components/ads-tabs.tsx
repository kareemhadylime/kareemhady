import Link from 'next/link';
import {
  LayoutDashboard, Megaphone, Users, Send, Search, Music2, Camera, Image as ImageIcon,
  KeyRound, BarChart3, MessageSquareText, FlaskConical, Rocket, Sparkles, Globe2,
} from 'lucide-react';

// Shared tab nav for the BH Ads module. The "active" prop is set by each
// page via its slug — comparison is case-insensitive substring so deep-link
// routes like /beithady/ads/google/publish still highlight the Google tab.

type TabDef = {
  slug: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  group: 'main' | 'publish' | 'manage';
};

const TABS: TabDef[] = [
  { slug: 'overview',    label: 'Overview',    href: '/beithady/ads',                       icon: LayoutDashboard, group: 'main' },
  { slug: 'campaigns',   label: 'Campaigns',   href: '/beithady/ads/campaigns',             icon: Megaphone,       group: 'main' },
  { slug: 'leads',       label: 'Leads',       href: '/beithady/ads/leads',                 icon: Users,           group: 'main' },
  { slug: 'performance', label: 'Performance', href: '/beithady/ads/performance',           icon: BarChart3,       group: 'main' },
  { slug: 'audience',    label: 'Audience',    href: '/beithady/ads/audience',              icon: Globe2,          group: 'main' },
  { slug: 'experiments', label: 'Experiments', href: '/beithady/ads/experiments',           icon: FlaskConical,    group: 'main' },
  { slug: 'recommendations', label: 'Recommendations', href: '/beithady/ads/recommendations', icon: Sparkles,      group: 'main' },

  { slug: 'create',      label: 'Meta CTWA',   href: '/beithady/ads/create',                icon: Send,            group: 'publish' },
  { slug: 'google',      label: 'Google Search', href: '/beithady/ads/google/publish',      icon: Search,          group: 'publish' },
  { slug: 'gpmax',       label: 'Google PMax', href: '/beithady/ads/google/pmax',           icon: Search,          group: 'publish' },
  { slug: 'tiktok-paid', label: 'TikTok Ads',  href: '/beithady/ads/tiktok/paid',           icon: Music2,          group: 'publish' },
  { slug: 'reels',       label: 'IG Reels',    href: '/beithady/ads/instagram/reels',       icon: Camera,          group: 'publish' },
  { slug: 'ig-boost',    label: 'Boost IG',    href: '/beithady/ads/instagram/boost',       icon: Rocket,          group: 'publish' },
  { slug: 'tt-organic',  label: 'TikTok Reels',href: '/beithady/ads/tiktok/organic',        icon: Music2,          group: 'publish' },

  { slug: 'gallery',     label: 'Gallery',     href: '/beithady/ads/gallery',               icon: ImageIcon,       group: 'manage' },
  { slug: 'accounts',    label: 'Accounts',    href: '/beithady/ads/accounts',              icon: KeyRound,        group: 'manage' },
  { slug: 'templates',   label: 'Templates',   href: '/beithady/ads/templates',             icon: MessageSquareText, group: 'manage' },
];

export function AdsTabs({ active }: { active: string }) {
  const groups: Array<{ key: 'main' | 'publish' | 'manage'; label: string }> = [
    { key: 'main', label: 'Manage' },
    { key: 'publish', label: 'Publish' },
    { key: 'manage', label: 'Settings' },
  ];

  return (
    <div className="ix-card p-2 flex flex-wrap items-center gap-3 text-xs">
      {groups.map(g => (
        <div key={g.key} className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 mr-1">{g.label}</span>
          {TABS.filter(t => t.group === g.key).map(tab => {
            const isActive = active.toLowerCase() === tab.slug;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.slug}
                href={tab.href}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                <Icon size={12} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
