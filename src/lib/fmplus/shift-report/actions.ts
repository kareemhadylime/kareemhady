'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
import { buildShiftReportHtml, buildShiftWAMessage } from './render';
import type { ShiftReportConfig, ShiftReportData } from './types';

const STORAGE_BUCKET = 'fmplus-shift-reports';

export interface ShiftReportRow {
  id:           string;
  contract_id:  number;
  report_date:  string;
  data:         ShiftReportData;
  submitted_at: string;
  submitted_by: string | null;
  wa_sent:      boolean;
  report_url:   string | null;
  report_path:  string | null;
}

export interface ConfigRow {
  contract_id:     number;
  contract_number: string | null;
  wa_group:        string | null;
  verticals:       ShiftReportConfig['verticals'];
  updated_at:      string;
}

export async function getShiftReportConfig(contractId: number): Promise<ConfigRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('fmplus_shift_report_configs')
    .select('contract_id, contract_number, wa_group, verticals, updated_at')
    .eq('contract_id', contractId)
    .maybeSingle();
  if (error) throw error;
  return (data as ConfigRow | null) ?? null;
}

export async function saveShiftReportConfig(
  contractId: number,
  cfg: ShiftReportConfig,
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('fmplus_shift_report_configs')
    .upsert({
      contract_id:     contractId,
      contract_number: cfg.contractNumber ?? null,
      wa_group:        cfg.waGroup ?? null,
      verticals:       cfg.verticals ?? {},
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'contract_id' });
  if (error) throw error;
  revalidatePath(`/fmplus/shift-report/${contractId}`);
}

export async function listShiftReports(contractId: number, limit = 30): Promise<ShiftReportRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('fmplus_shift_reports')
    .select('*')
    .eq('contract_id', contractId)
    .order('report_date', { ascending: false })
    .order('submitted_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ShiftReportRow[];
}

export interface SubmitResult {
  ok:           boolean;
  reportUrl?:   string | null;
  waSent:       boolean;
  waError?:     string;
  uploadError?: string;
}

export async function submitShiftReport(args: {
  contractId:    number;
  projectName:   string;
  data:          ShiftReportData;
  submittedBy?:  string;
}): Promise<SubmitResult> {
  const { contractId, projectName, data, submittedBy } = args;
  const sb = supabaseAdmin();

  // 1) Load the latest config for this contract
  const cfgRow = await getShiftReportConfig(contractId);
  if (!cfgRow) {
    return { ok: false, waSent: false, waError: 'config_not_found' };
  }
  const cfg: ShiftReportConfig = {
    contractNumber: cfgRow.contract_number ?? undefined,
    waGroup:        cfgRow.wa_group ?? undefined,
    verticals:      cfgRow.verticals ?? {},
  };

  // 2) Build + upload the detailed HTML report
  let reportUrl: string | null = null;
  let reportPath: string | null = null;
  let uploadError: string | undefined;
  try {
    const html = buildShiftReportHtml({ name: projectName, contractNumber: cfg.contractNumber }, cfg, data);
    const ts   = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `${contractId}/${ts}.html`;
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const { error: upErr } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(path, blob, {
        contentType: 'text/html; charset=utf-8',
        upsert: false,
      });
    if (upErr) throw upErr;
    const { data: pub } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    reportUrl  = pub?.publicUrl ?? null;
    reportPath = path;
  } catch (e) {
    uploadError = e instanceof Error ? e.message : String(e);
  }

  // 3) Build + send the WhatsApp summary
  const msg = buildShiftWAMessage({ name: projectName, contractNumber: cfg.contractNumber }, cfg, data, reportUrl);
  let waSent = false;
  let waError: string | undefined;
  if (cfg.waGroup) {
    // Normalize: strip non-digits, prefix Egyptian local numbers with 2,
    // and treat as group when target contains @g.us or looks like a group ID.
    const trimmed = cfg.waGroup.trim();
    const hasAt   = trimmed.includes('@');
    let digits    = trimmed.replace(/[^0-9]/g, '');
    if (digits.startsWith('0') && digits.length === 11) digits = '2' + digits;
    const looksLikeGroup = hasAt && (trimmed.includes('@g.us') || digits.length > 13);
    const result = await sendWhatsApp(
      looksLikeGroup
        ? { to: '', groupId: digits, message: msg }
        : { to: digits, message: msg },
    );
    waSent  = result.ok;
    if (!result.ok) waError = result.error;
  } else {
    waError = 'wa_group_not_configured';
  }

  // 4) Persist the row
  const today = new Date().toISOString().split('T')[0];
  const { error: insErr } = await sb
    .from('fmplus_shift_reports')
    .insert({
      contract_id:  contractId,
      report_date:  today,
      data,
      submitted_by: submittedBy ?? null,
      wa_sent:      waSent,
      report_url:   reportUrl,
      report_path:  reportPath,
    });
  if (insErr) {
    return { ok: false, reportUrl, waSent, waError, uploadError: insErr.message };
  }

  revalidatePath(`/fmplus/shift-report/${contractId}`);
  return { ok: true, reportUrl, waSent, waError, uploadError };
}
