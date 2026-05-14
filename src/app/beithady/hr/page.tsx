import {
  Users, Banknote, ShieldCheck, CalendarCheck, Fingerprint,
  CalendarOff, BarChart3, FileCheck, Award, ClipboardList, Network,
} from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { BeithadyLauncher, type LauncherTile } from '../_components/beithady-launcher';

export const dynamic = 'force-dynamic';

export default async function BeithadyHrPage() {
  await requireBeithadyPermission('hr', 'read');

  const tiles: LauncherTile[] = [
    {
      href: '/beithady/hr/team',
      title: 'Team Members',
      description: 'Full employee roster — add, edit, import from Excel. FMPLUS-style 3-tab profile: Personal · Contract & Payout · Timeline.',
      icon: Users,
      accent: 'violet',
    },
    {
      href: '/beithady/hr/payroll',
      title: 'Monthly Payroll',
      description: 'Upload monthly Excel → parse → store → print payslips per employee or batch by building.',
      icon: Banknote,
      accent: 'emerald',
      disabled: true,
      comingSoonLabel: 'Sprint 2',
    },
    {
      href: '/beithady/hr/salary-access',
      title: 'Salary Access',
      description: 'Control who can see salary data — 5 tiers: No Access · ≤10K · ≤20K · ≤50K · Unlimited.',
      icon: ShieldCheck,
      accent: 'amber',
      disabled: true,
      comingSoonLabel: 'Sprint 3',
    },
    {
      href: '/beithady/hr/attendance',
      title: 'Daily Attendance',
      description: 'Roll call · manual check-in/out by supervisor. Feeds Monthly Payroll working-days column.',
      icon: CalendarCheck,
      accent: 'cyan',
      disabled: true,
      comingSoonLabel: 'Sprint 4',
    },
    {
      href: '/beithady/hr/biometric',
      title: 'Biometric Upload',
      description: 'Upload fingerprint device .xlsx → PM review → finalize. Replaces manual attendance entry.',
      icon: Fingerprint,
      accent: 'indigo',
      disabled: true,
      comingSoonLabel: 'Sprint 5',
    },
    {
      href: '/beithady/hr/leave-ot',
      title: 'Leave & Overtime',
      description: 'Leave requests · approval workflow · balances · overtime logging per employee.',
      icon: CalendarOff,
      accent: 'rose',
      disabled: true,
      comingSoonLabel: 'Sprint 6',
    },
    {
      href: '/beithady/hr/headcount',
      title: 'Headcount Report',
      description: 'Daily manpower by scope & role. Cross-references HC Estimator planned vs. actual.',
      icon: BarChart3,
      accent: 'slate',
      disabled: true,
      comingSoonLabel: 'Sprint 7',
    },
    {
      href: '/beithady/hr/documents',
      title: 'Documents & Compliance',
      description: 'Contract files · IDs · tax forms · visa/contract expiry alerts.',
      icon: FileCheck,
      accent: 'gold',
      disabled: true,
      comingSoonLabel: 'Sprint 8',
    },
    {
      href: '/beithady/hr/training',
      title: 'Training & Certifications',
      description: 'Training records · certifications · expiry tracking per employee.',
      icon: Award,
      accent: 'emerald',
      disabled: true,
      comingSoonLabel: 'Sprint 9',
    },
    {
      href: '/beithady/hr/onboarding',
      title: 'Onboarding Checklist',
      description: 'New hire checklist · task assignments · completion tracking.',
      icon: ClipboardList,
      accent: 'amber',
      disabled: true,
      comingSoonLabel: 'Sprint 10',
    },
    {
      href: '/beithady/hr/org-chart',
      title: 'Org Chart',
      description: 'Visual reporting structure across all buildings and Head Office.',
      icon: Network,
      accent: 'violet',
      disabled: true,
      comingSoonLabel: 'Sprint 11',
    },
  ];

  return (
    <BeithadyShell breadcrumbs={[{ label: 'People', href: '/beithady/hr' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Beithady People"
        subtitle="Workforce management · Payroll · Attendance · Compliance"
      />
      <BeithadyLauncher tiles={tiles} columns={3} />
    </BeithadyShell>
  );
}
