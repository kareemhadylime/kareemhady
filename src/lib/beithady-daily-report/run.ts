import 'server-only';
import crypto from 'node:crypto';
import { supabaseAdmin } from '../supabase';
import { cairoYmd, isCairoHourGreaterOrEqual } from './cairo-dates';
import { buildDailyReport } from './build';
import { renderReportPdf } from './render-pdf';
import { distributeReport, type DistributeResult } from './distribute';
import type { DailyReportPayload } from './types';

// Idempotent run orchestrator. Called from the cron tick + the manual
// "Send Test Now" button. Each invocation:
//
//   1. Compute today's Cairo date.
//   2. Gate: if hour < 9 Cairo and not forced, exit (premature).
//   3. Upsert snapshot for (beithady_daily, today). Generate a random
//      token if the row is new.
//   4. If `delivery_complete` and not restricted, exit early.
//   5. If `payload IS NULL`, run buildDailyReport(). Persist payload +
//      bump build_attempts. On error, record + exit (next tick retries).
//   6. If `pdf_bytes IS NULL`, render the PDF. Persist bytea.
//   7. Call distributeReport() — fanout to recipients not yet `sent`.
//   8. If all active recipients are now sent, set delivery_complete=true.

const REPORT_KIND = 'beithady_daily';
const EXPIRY_HOURS = 48;

export type RunResult =
  | { ok: true; status: 'skipped_pre_9am' }
  | { ok: true; status: 'already_complete'; snapshot_id: string }
  | {
      ok: true;
      status: 'ran';
      snapshot_id: string;
      report_date: string;
      token: string;
      delivery: DistributeResult;
      built_now: boolean;
    }
  | { ok: false; error: string; phase: 'gate' | 'upsert' | 'build' | 'pdf' | 'distribute' };

function newToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export async function runDailyReport(opts: {
  trigger?: 'cron' | 'manual_test' | 'force';
  forceTimeGate?: boolean;
  forceRebuild?: boolean;
  restrictToRecipientIds?: string[] | null;
} = {}): Promise<RunResult> {
  const trigger = opts.trigger || 'cron';
  const sb = supabaseAdmin();

  // --- Gate (W4: 9 AM Cairo earliest) ---
  if (!opts.forceTimeGate && !isCairoHourGreaterOrEqual(9)) {
    return { ok: true, status: 'skipped_pre_9am' };
  }

  const today = cairoYmd();

  // --- Upsert snapshot ---
  // Try to find existing
  const { data: existing } = await sb
    .from('daily_report_snapshots')
    .select(
      'id, token, payload, pdf_bytes, delivery_complete, build_attempts, generated_at, expires_at, deleted_at'
    )
    .eq('report_kind', REPORT_KIND)
    .eq('report_date', today)
    .maybeSingle();

  type SnapshotRow = {
    id: string;
    token: string;
    payload: DailyReportPayload | null;
    pdf_bytes: Buffer | null;
    delivery_complete: boolean;
    build_attempts: number;
    generated_at: string;
    expires_at: string;
    deleted_at: string | null;
  };
  let snap = existing as SnapshotRow | null;

  if (!snap) {
    const token = newToken();
    const generated = new Date();
    const expires = new Date(generated.getTime() + EXPIRY_HOURS * 3600_000);
    const { data: inserted, error: insErr } = await sb
      .from('daily_report_snapshots')
      .insert({
        report_kind: REPORT_KIND,
        report_date: today,
        token,
        generated_at: generated.toISOString(),
        expires_at: expires.toISOString(),
        trigger,
      })
      .select(
        'id, token, payload, pdf_bytes, delivery_complete, build_attempts, generated_at, expires_at, deleted_at'
      )
      .single();
    if (insErr || !inserted) {
      return { ok: false, error: insErr?.message || 'insert_failed', phase: 'upsert' };
    }
    snap = inserted as SnapshotRow;
  }

  // --- Short-circuit if already delivered (and we're NOT in test/restricted mode) ---
  if (snap.delivery_complete && !opts.restrictToRecipientIds) {
    return { ok: true, status: 'already_complete', snapshot_id: snap.id };
  }

  // --- Build payload if missing ---
  let payload = snap.payload;
  let builtNow = false;
  if (!payload || opts.forceRebuild) {
    try {
      payload = await buildDailyReport(today);
      builtNow = true;
      await sb
        .from('daily_report_snapshots')
        .update({
          payload,
          build_attempts: (snap.build_attempts || 0) + 1,
          last_attempted_at: new Date().toISOString(),
          last_build_error: null,
        })
        .eq('id', snap.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb
        .from('daily_report_snapshots')
        .update({
          build_attempts: (snap.build_attempts || 0) + 1,
          last_attempted_at: new Date().toISOString(),
          last_build_error: msg.slice(0, 1000),
        })
        .eq('id', snap.id);
      return { ok: false, error: msg, phase: 'build' };
    }
  }

  // --- Render PDF if missing ---
  let pdfBytes: Buffer | null = snap.pdf_bytes
    ? toBuffer(snap.pdf_bytes)
    : null;
  if (!pdfBytes || builtNow) {
    try {
      pdfBytes = await renderReportPdf(payload!);
      await sb
        .from('daily_report_snapshots')
        .update({ pdf_bytes: pdfBytes })
        .eq('id', snap.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb
        .from('daily_report_snapshots')
        .update({ last_build_error: `pdf: ${msg.slice(0, 800)}` })
        .eq('id', snap.id);
      return { ok: false, error: msg, phase: 'pdf' };
    }
  }

  // --- Distribute ---
  const delivery = await distributeReport({
    snapshot_id: snap.id,
    token: snap.token,
    payload: payload!,
    pdf_bytes: pdfBytes!,
    restrict_to_recipient_ids: opts.restrictToRecipientIds || null,
  });

  if (delivery.delivery_complete) {
    await sb
      .from('daily_report_snapshots')
      .update({ delivery_complete: true })
      .eq('id', snap.id);
  }

  return {
    ok: true,
    status: 'ran',
    snapshot_id: snap.id,
    report_date: today,
    token: snap.token,
    delivery,
    built_now: builtNow,
  };
}

/**
 * 48-hour cleanup. Clears `pdf_bytes` and `payload` from expired snapshots,
 * marks them deleted_at. Run hourly.
 */
export async function cleanupExpiredSnapshots(): Promise<{
  ok: true;
  cleaned: number;
}> {
  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from('daily_report_snapshots')
    .update({ pdf_bytes: null, payload: null, deleted_at: nowIso })
    .lt('expires_at', nowIso)
    .is('deleted_at', null)
    .select('id');
  if (error) throw new Error(`cleanup_failed: ${error.message}`);
  return { ok: true, cleaned: (data as unknown[] | null)?.length || 0 };
}

// Supabase returns bytea as base64 string OR a hex `\x...` string depending
// on driver settings. Normalize to a Buffer.
function toBuffer(raw: unknown): Buffer | null {
  if (!raw) return null;
  if (Buffer.isBuffer(raw)) return raw;
  if (typeof raw === 'string') {
    if (raw.startsWith('\\x')) {
      return Buffer.from(raw.slice(2), 'hex');
    }
    return Buffer.from(raw, 'base64');
  }
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  return null;
}
