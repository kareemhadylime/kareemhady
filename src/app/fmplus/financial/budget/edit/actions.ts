'use server';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import type { ServiceLine } from '@/lib/fmplus/budget/types';

export async function saveBudgetAction(_args: { projectId: number; year: number; scenario: Scenario; serviceLine: ServiceLine; startMonth: number; lines: Array<{ sub_location: string|null; category: string; line_code: string; season: 'high'|'low'; qty: number; unit_cost: number }> }): Promise<{ ok: boolean; linesWritten: number; error?: string }> {
  return { ok: false, linesWritten: 0, error: 'Not implemented yet (Task 15)' };
}
export async function publishBudgetAction(args: Parameters<typeof saveBudgetAction>[0]): Promise<ReturnType<typeof saveBudgetAction>> {
  return saveBudgetAction(args);
}
