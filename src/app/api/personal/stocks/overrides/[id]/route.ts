// DELETE /api/personal/stocks/overrides/:id — admin-only: drop one position
// override row, reverting the (account, instrument) pair to computed positions.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const client = supabaseAdmin();
  const { error } = await client
    .from('personal_stock_position_overrides')
    .delete()
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: id });
}
