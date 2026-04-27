'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { generatePersona } from '@/lib/beithady/market/persona';

export async function regenPersonaAction(country: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'analytics', 'full'));
  if (!allowed) throw new Error('forbidden');

  const c = country.toUpperCase();
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_market_signals')
    .select('id, signal_type, origin_country, our_share_pct, egypt_share_pct, delta_pct, ai_persona, ai_persona_lang, ai_persona_at, computed_at')
    .eq('origin_country', c)
    .maybeSingle();
  if (!data) throw new Error('country_not_found');

  const persona = await generatePersona(data as Parameters<typeof generatePersona>[0]);
  await sb
    .from('beithady_market_signals')
    .update({
      ai_persona: persona,
      ai_persona_lang: 'en',
      ai_persona_at: new Date().toISOString(),
    })
    .eq('origin_country', c);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'persona_regenerated',
    target_type: 'country',
    target_id: c,
    metadata: { length: persona.length },
  });
  revalidatePath(`/emails/beithady/analytics/market-intel/${c}`);
}
