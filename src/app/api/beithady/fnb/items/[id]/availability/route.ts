import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  updateItem, upsertBuildingOverride, listBuildingOverridesForItem,
} from '@/lib/beithady/fnb/repo';

const Update = z.object({
  hours_start_override: z.string().nullable().optional(),
  hours_end_override: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  building_overrides: z.array(z.object({
    building_code: z.string().regex(/^BH-[A-Z0-9]+$/),
    is_out_of_stock: z.boolean(),
  })).default([]),
});

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  await requireBeithadyPermission('fnb', 'read');
  const { id } = await ctx.params;
  return NextResponse.json({
    overrides: await listBuildingOverridesForItem(id),
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const parsedResult = Update.safeParse(await req.json());
  if (!parsedResult.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsedResult.error.issues }, { status: 400 });
  }
  const parsed = parsedResult.data;

  // 1. Update hours / enabled if any of those fields were provided
  if (
    parsed.hours_start_override !== undefined ||
    parsed.hours_end_override !== undefined ||
    parsed.enabled !== undefined
  ) {
    const itemPatch: Partial<Parameters<typeof updateItem>[1]> = {};
    if (parsed.hours_start_override !== undefined) {
      itemPatch.hours_start_override = parsed.hours_start_override ?? null;
    }
    if (parsed.hours_end_override !== undefined) {
      itemPatch.hours_end_override = parsed.hours_end_override ?? null;
    }
    if (parsed.enabled !== undefined) {
      itemPatch.enabled = parsed.enabled;
    }
    await updateItem(id, itemPatch, { actor_user_id: user.id });
  }

  // 2. Upsert each per-building override
  for (const ov of parsed.building_overrides) {
    await upsertBuildingOverride({
      building_code: ov.building_code,
      item_id: id,
      is_out_of_stock: ov.is_out_of_stock,
    }, { actor_user_id: user.id });
  }

  return NextResponse.json({ ok: true });
}
