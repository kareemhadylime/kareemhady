import { User, ShoppingBag, Citrus, Building2, Zap, Home, Layers } from 'lucide-react';
import type { Domain } from '@/lib/rules/presets';

const ICONS = {
  personal: User,
  kika: ShoppingBag,
  lime: Citrus,
  fmplus: Building2,
  voltauto: Zap,
  beithady: Home,
} as const;

export function DomainIcon({
  domain,
  size = 24,
  className,
}: {
  domain: Domain | 'other';
  size?: number;
  className?: string;
}) {
  const Icon = domain === 'other' ? Layers : ICONS[domain];
  return <Icon size={size} className={className} strokeWidth={2.2} />;
}
