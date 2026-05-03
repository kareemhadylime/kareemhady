'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import {
  requireBoatRoleOrThrow,
  s,
  sOrNull,
  nOrNull,
} from '@/lib/boat-rental/server-helpers';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';

const VALID_LANGS = ['en', 'ar'] as const;

export async function saveOwnerSettingsAction(formData: FormData): Promise<void> {
  const me = await requireBoatRoleOrThrow('owner');
  const ownerIds = await getOwnedOwnerIds(me);
  if (ownerIds.length === 0) throw new Error('no_owner');
  const ownerId = ownerIds[0];

  const fuelPrice = nOrNull(formData.get('default_fuel_price_per_l'));
  const marinaVendor = sOrNull(formData.get('preferred_marina_vendor'));
  const notifLangRaw = s(formData.get('notification_lang'));
  const reminderLangRaw = s(formData.get('reminder_24h_lang'));
  const whatsappRaw = sOrNull(formData.get('whatsapp'));

  const notificationLang = (VALID_LANGS as readonly string[]).includes(notifLangRaw)
    ? notifLangRaw
    : 'en';
  const reminder24hLang = (VALID_LANGS as readonly string[]).includes(reminderLangRaw)
    ? reminderLangRaw
    : 'ar';
  // Strip everything except digits — Green-API expects raw chatId format.
  const whatsapp = whatsappRaw ? whatsappRaw.replace(/[^0-9]/g, '') || null : null;
  if (whatsapp && (whatsapp.length < 8 || whatsapp.length > 15)) {
    throw new Error('invalid_whatsapp');
  }
  if (fuelPrice !== null && (fuelPrice < 0 || fuelPrice > 100000)) {
    throw new Error('invalid_fuel_price');
  }

  const sb = supabaseAdmin();
  await sb.from('boat_rental_owner_settings').upsert({
    owner_id: ownerId,
    default_fuel_price_per_l: fuelPrice,
    preferred_marina_vendor: marinaVendor,
    notification_lang: notificationLang,
    reminder_24h_lang: reminder24hLang,
    whatsapp,
    updated_at: new Date().toISOString(),
  });

  revalidatePath('/emails/boat-rental/owner/settings');
  revalidatePath('/emails/boat-rental/owner/money');
}
