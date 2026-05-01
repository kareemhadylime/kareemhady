'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';
import {
  validateBuildingPin,
  writeMobileSession,
  clearMobileSession,
  readMobileSession,
  checkPinRateLimit,
  recordPinAttempt,
} from '@/lib/beithady/inventory/mobile-pin';
import { nextIssueNo } from '@/lib/beithady/inventory/issue';

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function loginMobileAction(formData: FormData): Promise<LoginResult> {
  const warehouseCode = String(formData.get('warehouse_code') || '').trim();
  const pin = String(formData.get('pin') || '').trim();
  const cleanerName = String(formData.get('cleaner_name') || '').trim();

  if (!warehouseCode) return { ok: false, error: 'اختر المبنى' };
  if (!cleanerName || cleanerName.length < 2) return { ok: false, error: 'الاسم مطلوب' };
  if (!pin || pin.length !== 6) return { ok: false, error: 'الرمز يجب أن يكون 6 أرقام' };

  // Audit fix C4: per-IP rate-limit. The pre-fix endpoint had no
  // counter, so a 6-digit PIN was brute-forceable in hours. Now we
  // record every attempt and lock out after 5 failures in 5 minutes.
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim()
    || h.get('x-real-ip')
    || null;
  const userAgent = h.get('user-agent') || null;

  const rl = await checkPinRateLimit(ip);
  if (rl.locked) {
    await recordPinAttempt({ warehouseCode, ip, userAgent, cleanerName, success: false });
    await recordAudit({
      actor_user_id: null,
      module: 'inventory',
      action: 'mobile.login.rate_limited',
      target_type: 'warehouse',
      metadata: { warehouse_code: warehouseCode, ip, retry_after_sec: rl.retryAfterSec },
    });
    return { ok: false, error: `محاولات كثيرة — أعد المحاولة بعد ${Math.ceil(rl.retryAfterSec / 60)} دقيقة` };
  }

  const wh = await validateBuildingPin(warehouseCode, pin);
  if (!wh) {
    await recordPinAttempt({ warehouseCode, ip, userAgent, cleanerName, success: false });
    await recordAudit({
      actor_user_id: null,
      module: 'inventory',
      action: 'mobile.login.fail',
      target_type: 'warehouse',
      metadata: { warehouse_code: warehouseCode, ip, cleaner_name: cleanerName },
    });
    return { ok: false, error: 'الرمز غير صحيح' };
  }

  await recordPinAttempt({ warehouseCode, ip, userAgent, cleanerName, success: true });

  await writeMobileSession({
    warehouseCode: wh.code,
    warehouseId: wh.id,
    warehouseName: wh.name_ar || wh.name_en,
    buildingCode: wh.building_code,
    cleanerName,
  });

  await recordAudit({
    actor_user_id: null,
    module: 'inventory',
    action: 'mobile.login',
    target_type: 'warehouse',
    target_id: wh.id,
    metadata: { cleaner_name: cleanerName, warehouse_code: warehouseCode, ip },
  });

  redirect('/beithady/inventory/m');
}

export async function logoutMobileAction(): Promise<void> {
  const session = await readMobileSession();
  if (session) {
    await recordAudit({
      actor_user_id: null,
      module: 'inventory',
      action: 'mobile.logout',
      target_type: 'warehouse',
      target_id: session.warehouseId,
      metadata: { cleaner_name: session.cleanerName },
    });
  }
  await clearMobileSession();
  redirect('/beithady/inventory/m');
}

// PIN-gated inventory issue post — used by the mobile cleaner app.
// Skips role-based requireBeithadyPermission; PIN is the auth.
export type MobileIssueInput = {
  type: 'per_reservation' | 'maintenance_task' | 'welcome_tray' | 'damage_writeoff';
  ref_reservation_id?: string;
  notes?: string;
  photo_url?: string;
  lines: Array<{ item_id: string; qty: number; note?: string }>;
};

export type MobileIssueResult =
  | { ok: true; issue_id: string; issue_no: string; status: string }
  | { ok: false; error: string };

export async function postMobileIssueAction(input: MobileIssueInput): Promise<MobileIssueResult> {
  const session = await readMobileSession();
  if (!session) return { ok: false, error: 'الجلسة منتهية — أعد إدخال الرمز' };

  if (!input.lines || input.lines.length === 0) {
    return { ok: false, error: 'أضف صنفاً واحداً على الأقل' };
  }
  for (const l of input.lines) {
    if (!l.item_id) return { ok: false, error: 'كل سطر يحتاج صنفاً' };
    if (l.qty <= 0) return { ok: false, error: 'الكمية يجب أن تكون أكبر من صفر' };
  }

  const sb = supabaseAdmin();
  const issue_no = await nextIssueNo();
  const sessionLabel = `${session.cleanerName} · ${new Date().toLocaleDateString('en-GB')}`;

  // Always submit through approval workflow — never auto-post via mobile.
  // Manager/warehouse_manager approves on the desktop side.
  const { data: header, error: hErr } = await sb
    .from('beithady_inventory_issues')
    .insert({
      issue_no,
      status: 'submitted',
      type: input.type,
      warehouse_id: session.warehouseId,
      ref_reservation_id: input.ref_reservation_id || null,
      notes: input.notes || null,
      photo_url: input.photo_url || null,
      created_by_user: `mobile_pin:${session.warehouseCode}`,
      created_via: 'mobile_pin',
      cleaner_session_name: sessionLabel,
    })
    .select('*')
    .single();

  if (hErr || !header) return { ok: false, error: hErr?.message || 'فشل الحفظ' };

  const linesToInsert = input.lines.map((l, i) => ({
    issue_id: header.id,
    line_no: i + 1,
    item_id: l.item_id,
    qty: l.qty,
    batch_no_picked: '__bulk__',
    note: l.note || null,
  }));
  const { error: lErr } = await sb.from('beithady_inventory_issue_lines').insert(linesToInsert);
  if (lErr) {
    await sb.from('beithady_inventory_issues').delete().eq('id', header.id);
    return { ok: false, error: lErr.message };
  }

  await recordAudit({
    actor_user_id: null,
    module: 'inventory',
    action: 'mobile.issue.submit',
    target_type: 'issue',
    target_id: header.id,
    metadata: {
      cleaner_name: session.cleanerName,
      warehouse_code: session.warehouseCode,
      type: input.type,
      line_count: input.lines.length,
    },
  });

  revalidatePath('/beithady/inventory/issue');
  revalidatePath('/beithady/inventory/m');
  return { ok: true, issue_id: header.id, issue_no, status: 'submitted' };
}
