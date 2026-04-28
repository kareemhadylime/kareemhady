import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { RecipientsManager } from './_recipients-manager';

export const dynamic = 'force-dynamic';

type Extra = {
  id: string;
  role: 'guest_relations' | 'ops' | 'finance';
  label: string;
  email: string | null;
  whatsapp: string | null;
  enabled: boolean;
  created_at: string;
};

type AutoUser = {
  user_id: string;
  username: string | null;
  whatsapp: string | null;
  roles: string[];
};

async function getData(): Promise<{ extras: Extra[]; autoUsers: AutoUser[] }> {
  const sb = supabaseAdmin();
  const [{ data: extras }, { data: roleRows }] = await Promise.all([
    sb.from('beithady_morning_brief_extras')
      .select('id, role, label, email, whatsapp, enabled, created_at')
      .order('role')
      .order('label'),
    sb.from('beithady_user_roles').select('user_id, role'),
  ]);
  const userIds = Array.from(new Set(((roleRows as Array<{ user_id: string; role: string }> | null) || []).map(r => r.user_id)));
  const { data: users } = userIds.length > 0
    ? await sb.from('app_users').select('id, username, whatsapp').in('id', userIds)
    : { data: [] };
  const rolesByUser = new Map<string, string[]>();
  for (const r of (roleRows as Array<{ user_id: string; role: string }> | null) || []) {
    const arr = rolesByUser.get(r.user_id) || [];
    arr.push(r.role);
    rolesByUser.set(r.user_id, arr);
  }
  const autoUsers: AutoUser[] = ((users as Array<{ id: string; username: string | null; whatsapp: string | null }> | null) || []).map(u => ({
    user_id: u.id,
    username: u.username,
    whatsapp: u.whatsapp,
    roles: rolesByUser.get(u.id) || [],
  }));
  return {
    extras: (extras as Extra[] | null) || [],
    autoUsers,
  };
}

export default async function RecipientsPage() {
  await requireBeithadyPermission('operations', 'full');
  const { extras, autoUsers } = await getData();
  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Operations', href: '/beithady/operations' },
      { label: 'Morning Brief', href: '/beithady/operations/morning-brief' },
      { label: 'Recipients' },
    ]} containerClass="max-w-4xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Operations"
        title="Morning Brief Recipients"
        subtitle="Auto-broadcast = users with the matching beithady_user_role. Plus the admin-curated extras below."
      />
      <RecipientsManager extras={extras} autoUsers={autoUsers} />
    </BeithadyShell>
  );
}
