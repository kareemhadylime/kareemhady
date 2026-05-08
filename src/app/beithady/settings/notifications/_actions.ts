'use server';
import {
  saveWaNotificationSettings,
  type WaNotificationSettings,
} from '@/lib/beithady/wa-reservation-notify';

export async function saveNotificationSettingsAction(
  settings: WaNotificationSettings,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await saveWaNotificationSettings(settings);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
