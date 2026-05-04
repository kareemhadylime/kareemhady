import 'server-only';
import { ReactNode } from 'react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { FnbTabs } from './_components/fnb-tabs';

export const dynamic = 'force-dynamic';

export default async function FnbLayout({ children }: { children: ReactNode }) {
  await requireBeithadyPermission('fnb', 'read');
  return (
    <BeithadyShell>
      <BeithadyHeader
        eyebrow="Beit Hady"
        title="F&B / In-Room Dining"
        subtitle="Egypt buildings only — BH-26 · BH-73 · BH-435 · BH-OK · BH-34"
      />
      <FnbTabs />
      {children}
    </BeithadyShell>
  );
}
