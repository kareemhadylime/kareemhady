import 'server-only';
import { supabaseAdmin } from '../supabase';

// Shared Supabase Storage helpers for the boat-rental module.
// Bucket is private — all reads go through time-limited signed URLs.

const BUCKET = 'boat-rental';
const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour

export async function signedImageUrl(storagePath: string | null | undefined): Promise<string | null> {
  if (!storagePath) return null;
  const sb = supabaseAdmin();
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl || null;
}

export async function signedImageUrls(paths: Array<string | null | undefined>): Promise<Array<string | null>> {
  return Promise.all(paths.map(p => signedImageUrl(p)));
}
