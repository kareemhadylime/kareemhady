import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { computeRecipeCost, updateItem } from '@/lib/beithady/fnb/repo';

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const result = await computeRecipeCost(id);
  if (result.cost_usd == null) {
    return NextResponse.json({
      error: 'incomplete_recipe',
      detail: 'One or more ingredients lack a unit cost in USD. Set default_cost_usd or avg_cost_egp + an fx_rates row.',
      breakdown: result.lines,
    }, { status: 422 });
  }
  // Persist the computed cost to the menu item
  const item = await updateItem(id, { cost_usd: result.cost_usd }, { actor_user_id: user.id });
  return NextResponse.json({ item, cost_usd: result.cost_usd, breakdown: result.lines });
}
