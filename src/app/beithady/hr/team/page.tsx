// src/app/beithady/hr/team/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listEmployees } from '@/lib/beithady/hr/hr-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { TeamRoster } from './_components/team-roster';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  await requireBeithadyPermission('hr', 'read');

  const { rows, total } = await listEmployees({ pageSize: 200 });

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Team Members' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Team Members"
        subtitle={`${total} employee${total !== 1 ? 's' : ''} — add, edit, import from Excel`}
      />
      <TeamRoster initialRows={rows} />
    </BeithadyShell>
  );
}
