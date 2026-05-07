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
//   3. SELECT existing snapshot for (beithady_daily, today).
//   4. If `delivery_complete` and not restricted, exit early.
//   5. If existing row has well-formed payload (and not forceRebuild),
//      skip the build. Otherwise BUILD FIRST — buildDailyReport() runs
//      to completion (or throws). The row is touched only AFTER the
//      build resolves. This is critical: Vercel's maxDuration kills the
//      whole function on timeout, so an INSERT-then-build pattern would
//      leave NULL-payload rows behind on every timeout. Building before
//      writing means a timed-out build leaves the row exactly as it was
//      (absent or with the prior payload) and the next tick retries.
//   6. UPSERT — UPDATE existing row with payload + bumped build_attempts,
//      or INSERT a new row that already includes the payload.
//   7. If `pdf_bytes IS NULL`, render the PDF. Persist bytea.
//   8. Call distributeReport() — fanout to recipients not yet `sent`.
//   9. If all active recipients are now sent, set delivery_complete=true.

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

/**
 * A payload is treated as good enough to skip rebuilding when it has the
 * three required sections — `all`, `reviews`, `per_building`. NULL payloads
 * (from the legacy INSERT-then-build pattern that timed out) and partial
 * payloads (e.g. cleanup blanked it but didn't tombstone) both fail this
 * check and trigger a rebuild on the next tick. Mirror of the dashboard
 * `load-snapshot.ts` `isPayloadWellFormed` so the read and write sides
 * agree on what "valid" means.
 */
function isPayloadWellFormed(payload: unknown): payload is DailyReportPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Partial<DailyReportPayload>;
  return Boolean(p.all && p.reviews && p.per_building);
}

export async function runDailyReport(opts: {
  trigger?: 'cron' | 'manual_test' | 'force' | 'backfill';
  forceTimeGate?: boolean;
  forceRebuild?: boolean;
  restrictToRecipientIds?: string[] | null;
  /**
   * Override "today" with a specific YYYY-MM-DD. Used for backfilling
   * historical NULL-payload rows. Must pass a valid YYYY-MM-DD; invalid
   * input is rejected with `phase: 'gate'`.
   */
  dateOverride?: string;
  /**
   * Skip the distribute phase. Set automatically when `dateOverride` is
   * for a past date (we don't want to email a stale historical report
   * to recipients). Can also be set explicitly for non-distribution
   * rebuilds (e.g. previewing a payload).
   */
  skipDistribution?: boolean;
} = {}): Promise<RunResult> {
  const trigger = opts.trigger || 'cron';
  const sb = supabaseAdmin();

  // --- Gate (W4: 9 AM Cairo earliest) ---
  if (!opts.forceTimeGate && !isCairoHourGreaterOrEqual(9)) {
    return { ok: true, status: 'skipped_pre_9am' };
  }

  // --- Resolve target date (today by default; admin can override for backfills) ---
  let today = cairoYmd();
  if (opts.dateOverride) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.dateOverride)) {
      return { ok: false, error: `invalid_date_override: ${opts.dateOverride}`, phase: 'gate' };
    }
    today = opts.dateOverride;
  }
  // Distribute defaults to true for "today" runs and false for any
  // historical override — admins backfilling old dates almost certainly
  // don't want to email a stale report. Caller can still force it via
  // skipDistribution: false.
  const skipDistribution =
    opts.skipDistribution ?? (opts.dateOverride && opts.dateOverride !== cairoYmd());

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

  // --- SELECT existing snapshot (fast read; no row writes yet) ---
  const { data: existing } = await sb
    .from('daily_report_snapshots')
    .select(
      'id, token, payload, pdf_bytes, delivery_complete, build_attempts, generated_at, expires_at, deleted_at'
    )
    .eq('report_kind', REPORT_KIND)
    .eq('report_date', today)
    .maybeSingle();

  let snap = existing as SnapshotRow | null;

  // --- Short-circuit if already delivered (no build needed) ---
  if (snap?.delivery_complete && !opts.restrictToRecipientIds) {
    return { ok: true, status: 'already_complete', snapshot_id: snap.id };
  }

  // --- Decide whether the payload needs (re)building ---
  // Existing rows with NULL payload OR missing core sections (the cron-gap
  // pattern from before this fix landed) are treated as if they had no
  // payload — we rebuild and overwrite.
  const existingPayloadOk = isPayloadWellFormed(snap?.payload);
  const needsBuild = !snap || !existingPayloadOk || !!opts.forceRebuild;

  let payload: DailyReportPayload | null = existingPayloadOk
    ? (snap!.payload as DailyReportPayload)
    : null;
  let builtNow = false;

  if (needsBuild) {
    // BUILD FIRST. If buildDailyReport throws, we record the error against
    // the existing row (if any) but DO NOT create a new NULL-payload row.
    // If the function is killed by Vercel mid-build (the original bug),
    // no UPDATE/INSERT runs and the table stays exactly as it was — the
    // next tick will pick up cleanly.
    try {
      payload = await buildDailyReport(today);
      builtNow = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (snap) {
        await sb
          .from('daily_report_snapshots')
          .update({
            build_attempts: (snap.build_attempts || 0) + 1,
            last_attempted_at: new Date().toISOString(),
            last_build_error: msg.slice(0, 1000),
          })
          .eq('id', snap.id);
      }
      // Intentionally NOT inserting an error-only observability row when
      // no row exists — that would re-introduce NULL-payload rows the
      // dashboard has to filter around. Vercel logs + HTTP 500 response
      // are sufficient breadcrumbs.
      return { ok: false, error: msg, phase: 'build' };
    }

    // --- Persist the freshly-built payload (UPDATE existing or INSERT new) ---
    if (snap) {
      const { error: updErr } = await sb
        .from('daily_report_snapshots')
        .update({
          payload,
          build_attempts: (snap.build_attempts || 0) + 1,
          last_attempted_at: new Date().toISOString(),
          last_build_error: null,
        })
        .eq('id', snap.id);
      if (updErr) {
        return { ok: false, error: updErr.message, phase: 'upsert' };
      }
      snap = { ...snap, payload };
    } else {
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
          payload,
          build_attempts: 1,
          last_attempted_at: generated.toISOString(),
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
  }

  // After the build branch, snap and payload are both populated.
  if (!snap || !payload) {
    return { ok: false, error: 'invariant_no_snap_after_build', phase: 'upsert' };
  }

  // --- Render PDF if missing ---
  let pdfBytes: Buffer | null = snap.pdf_bytes
    ? toBuffer(snap.pdf_bytes)
    : null;
  if (!pdfBytes || builtNow) {
    try {
      pdfBytes = await renderReportPdf(payload);
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

  if (!pdfBytes) {
    return { ok: false, error: 'invariant_no_pdf_after_render', phase: 'pdf' };
  }

  // --- Distribute (skipped for historical backfills) ---
  const delivery: DistributeResult = skipDistribution
    ? { attempted: 0, sent: 0, failed: 0, skipped: 0, errors: [], delivery_complete: false }
    : await distributeReport({
        snapshot_id: snap.id,
        token: snap.token,
        payload,
        pdf_bytes: pdfBytes,
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
