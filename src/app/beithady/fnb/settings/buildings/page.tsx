import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { SettingsTabs } from '../_components/settings-tabs';
import { BuildingsForm } from './_components/buildings-form';

export const dynamic = 'force-dynamic';

export default async function BuildingsSettingsPage() {
  await requireBeithadyPermission('fnb', 'read');
  const sb = supabaseAdmin();
  const { data } = await sb.from('fnb_buildings').select('*').order('building_code');
  return (
    <>
      <SettingsTabs />
      <BuildingsForm initial={(data ?? []) as never[]} />
    </>
  );
}
