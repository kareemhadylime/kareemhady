// src/lib/beithady/hr/hr-leave-ot-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import type { AddLeaveInput, LogOtInput, LeaveType } from './hr-leave-ot-types';

const REVALIDATE = '/beithady/hr/leave-ot';

// ── addLeaveRequestAction ─────────────────────────────────────────────────────

export async function addLeaveRequestAction(
  input: AddLeaveInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    if (!input.employee_id) return { ok: false, error: 'Employee is required' };
    if (!input.start_date || !input.end_date) return { ok: false, error: 'Dates are required' };
    if (input.days_count <= 0) return { ok: false, error: 'Days count must be > 0' };

    const sb = supabaseAdmin();
    const { error } = await sb.from('hr_leave_requests').insert({
      employee_id:  input.employee_id,
      leave_type:   input.leave_type,
      start_date:   input.start_date,
      end_date:     input.end_date,
      days_count:   input.days_count,
      reason:       input.reason || null,
      status:       'pending',
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── reviewLeaveRequestAction ──────────────────────────────────────────────────

export async function reviewLeaveRequestAction(
  requestId: string,
  decision: 'approved' | 'rejected'
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user } = await requireBeithadyPermission('hr', 'full');
    const sb = supabaseAdmin();

    // Fetch the request
    const { data: req, error: rErr } = await sb
      .from('hr_leave_requests')
      .select('employee_id, leave_type, days_count, start_date, status')
      .eq('id', requestId)
      .single();
    if (rErr || !req) return { ok: false, error: 'Request not found' };
    if ((req as { status: string }).status !== 'pending') return { ok: false, error: 'Request already reviewed' };

    const r = req as { employee_id: string; leave_type: string; days_count: number; start_date: string };

    // Update status
    const { error: uErr } = await sb
      .from('hr_leave_requests')
      .update({ status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', requestId);
    if (uErr) return { ok: false, error: uErr.message };

    // Deduct balance if approved + not emergency
    if (decision === 'approved' && r.leave_type !== 'emergency') {
      const year = new Date(r.start_date).getFullYear();
      const { data: bal } = await sb
        .from('hr_leave_balances')
        .select('id, used_days')
        .eq('employee_id', r.employee_id)
        .eq('year', year)
        .eq('leave_type', r.leave_type)
        .maybeSingle();

      if (bal) {
        await sb
          .from('hr_leave_balances')
          .update({ used_days: (bal as { id: string; used_days: number }).used_days + r.days_count })
          .eq('id', (bal as { id: string }).id);
      } else {
        await sb.from('hr_leave_balances').insert({
          employee_id: r.employee_id,
          year,
          leave_type:  r.leave_type,
          total_days:  0,
          used_days:   r.days_count,
        });
      }
    }

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── setLeaveBalanceAction ─────────────────────────────────────────────────────

export async function setLeaveBalanceAction(
  employeeId: string,
  year: number,
  leaveType: LeaveType,
  totalDays: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireBeithadyPermission('hr', 'full');
    if (totalDays < 0) return { ok: false, error: 'Total days must be ≥ 0' };

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('hr_leave_balances')
      .upsert(
        { employee_id: employeeId, year, leave_type: leaveType, total_days: totalDays },
        { onConflict: 'employee_id,year,leave_type' }
      );
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── logOvertimeAction ─────────────────────────────────────────────────────────

export async function logOvertimeAction(
  input: LogOtInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    if (!input.employee_id) return { ok: false, error: 'Employee is required' };
    if (!input.date)        return { ok: false, error: 'Date is required' };
    if (input.hours <= 0)   return { ok: false, error: 'Hours must be > 0' };

    const sb = supabaseAdmin();
    const { error } = await sb.from('hr_overtime_records').insert({
      employee_id:  input.employee_id,
      date:         input.date,
      hours:        input.hours,
      reason:       input.reason || null,
      status:       'pending',
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ── reviewOvertimeAction ──────────────────────────────────────────────────────

export async function reviewOvertimeAction(
  recordId: string,
  decision: 'approved' | 'rejected'
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user } = await requireBeithadyPermission('hr', 'full');
    const sb = supabaseAdmin();

    const { error } = await sb
      .from('hr_overtime_records')
      .update({ status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', recordId)
      .eq('status', 'pending');
    if (error) return { ok: false, error: error.message };

    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
