import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { OrderBoard } from './_components/order-board';

export const dynamic = 'force-dynamic';

export default async function FnbOrdersPage() {
  await requireBeithadyPermission('fnb', 'read');
  const sb = supabaseAdmin();
  const { data: buildings } = await sb.from('fnb_buildings')
    .select('building_code, enabled').order('building_code');
  return <OrderBoard buildings={(buildings ?? []) as Array<{ building_code: string; enabled: boolean }>} />;
}
