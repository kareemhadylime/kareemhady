'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBoatAdmin, s } from '@/lib/boat-rental/server-helpers';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';

export async function retryNotificationAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const id = s(formData.get('id'));
  if (!id) return;
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('boat_rental_notifications')
    .select('id, to_phone, rendered_body, status')
    .eq('id', id)
    .maybeSingle();
  const r = row as { id: number; to_phone: string; rendered_body: string; status: string } | null;
  if (!r || r.status === 'sent') return;

  const result = await sendWhatsApp({ to: r.to_phone, message: r.rendered_body });
  if (result.ok) {
    await sb
      .from('boat_rental_notifications')
      .update({ status: 'sent', provider_msg_id: result.providerMessageId, sent_at: new Date().toISOString(), error: null })
      .eq('id', id);
  } else {
    await sb
      .from('boat_rental_notifications')
      .update({ status: 'failed', error: result.error })
      .eq('id', id);
  }
  revalidatePath('/emails/boat-rental/admin/notifications');
}
