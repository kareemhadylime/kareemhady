import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword } from '@/lib/auth';

// One-shot bootstrap for the first admin password. Only works when the
// default user's password_hash is empty / null, so it can't be abused to
// hijack an existing account. Bearer-protected with CRON_SECRET.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" -X POST \
//     -H "Content-Type: application/json" \
//     -d '{"username":"kareem","password":"..."}' \
//     https://kareemhady.vercel.app/api/auth/bootstrap

export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  let username = '';
  let password = '';
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
    };
    username = (body.username || '').trim().toLowerCase();
    password = body.password || '';
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  if (!username || password.length < 8) {
    return NextResponse.json(
      { ok: false, error: 'username required + password min 8 chars' },
      { status: 400 }
    );
  }

  const sb = supabaseAdmin();
  const hash = hashPassword(password);

  // Find existing user
  const { data: existing } = await sb
    .from('app_users')
    .select('id, password_hash')
    .eq('username', username)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; password_hash: string };
    // Only overwrite if no password is set — prevents password reset via this endpoint.
    if (row.password_hash && row.password_hash.startsWith('scrypt$')) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'password already bootstrapped — change via /admin/users when signed in',
        },
        { status: 409 }
      );
    }
    await sb
      .from('app_users')
      .update({ password_hash: hash, role: 'admin' })
      .eq('id', row.id);
    return NextResponse.json({ ok: true, updated: true, user_id: row.id });
  }

  const { data: created, error: createErr } = await sb
    .from('app_users')
    .insert({
      username,
      password_hash: hash,
      role: 'admin',
      is_default: true,
    })
    .select('id')
    .single();
  if (createErr) {
    return NextResponse.json(
      { ok: false, error: createErr.message },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: true,
    created: true,
    user_id: (created as { id: string }).id,
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}
