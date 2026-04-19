import { supabaseAdmin } from './supabase';
import { fetchLast24hMetadata } from './gmail';

export async function runDaily(trigger: 'cron' | 'manual') {
  const sb = supabaseAdmin();

  const { data: run, error: runErr } = await sb
    .from('runs')
    .insert({ trigger, status: 'running' })
    .select()
    .single();

  if (runErr || !run) {
    return { ok: false, error: 'failed_to_open_run', details: runErr };
  }

  try {
    const { data: accounts } = await sb.from('accounts').select('*').eq('enabled', true);

    let totalFetched = 0;
    for (const acc of accounts || []) {
      const msgs = await fetchLast24hMetadata(acc.oauth_refresh_token_encrypted);
      totalFetched += msgs.length;

      for (const m of msgs) {
        const headers = Object.fromEntries(
          (m.payload?.headers || []).map((h: any) => [
            (h.name || '').toLowerCase(),
            h.value,
          ])
        );
        await sb.from('email_logs').upsert(
          {
            run_id: run.id,
            account_id: acc.id,
            gmail_message_id: m.id!,
            gmail_thread_id: m.threadId!,
            from_address: headers.from || null,
            to_address: headers.to || null,
            subject: headers.subject || null,
            received_at: m.internalDate
              ? new Date(parseInt(m.internalDate as string, 10)).toISOString()
              : null,
            snippet: m.snippet || null,
            label_ids: m.labelIds || [],
          },
          { onConflict: 'account_id,gmail_message_id' }
        );
      }

      await sb
        .from('accounts')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', acc.id);
    }

    await sb
      .from('runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        emails_fetched: totalFetched,
      })
      .eq('id', run.id);

    return { ok: true, run_id: run.id, emails_fetched: totalFetched };
  } catch (e: any) {
    await sb
      .from('runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error: String(e?.message || e),
      })
      .eq('id', run.id);
    return { ok: false, error: 'run_failed', details: String(e) };
  }
}

export function isCairo9AM(): boolean {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    hour12: false,
  }).format(new Date());
  return parseInt(hour, 10) === 9;
}
