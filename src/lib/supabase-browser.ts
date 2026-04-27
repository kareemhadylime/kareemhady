'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Browser-side Supabase client — uses the publishable / anon key only.
// Used for Realtime subscriptions in the Operations Calendar.
let _client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  return _client;
}
