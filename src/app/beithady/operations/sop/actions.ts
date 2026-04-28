'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';

export async function acknowledgeArticleAction(input: {
  articleId: string;
  version: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'read');
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('beithady_sop_acknowledgments')
    .insert({
      article_id: input.articleId,
      user_id: user.id,
      version_acknowledged: input.version,
    });
  if (error && !/duplicate key/i.test(error.message)) {
    return { ok: false, error: error.message };
  }
  revalidatePath('/beithady/operations/sop');
  return { ok: true };
}

export async function updateArticleBodyAction(input: {
  slug: string;
  body_md: string;
  title?: string;
  summary?: string;
  bumpVersion?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'full');
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('beithady_sop_articles')
    .select('id, version, body_md, title, summary')
    .eq('slug', input.slug)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'Article not found' };
  const e = existing as { id: string; version: number; body_md: string; title: string; summary: string | null };
  const update: Record<string, unknown> = {
    body_md: input.body_md,
    updated_by_user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (input.title) update.title = input.title;
  if (input.summary != null) update.summary = input.summary;
  if (input.bumpVersion && input.body_md !== e.body_md) {
    update.version = e.version + 1;
  }
  const { error } = await sb
    .from('beithady_sop_articles')
    .update(update)
    .eq('id', e.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/beithady/operations/sop');
  revalidatePath(`/beithady/operations/sop/${input.slug}`);
  return { ok: true };
}

export async function createArticleAction(input: {
  slug: string;
  title: string;
  summary?: string;
  body_md: string;
  language: 'en' | 'ar';
  kind: 'sop' | 'checklist' | 'kb';
  role: 'reception' | 'guest_relations' | 'housekeeping' | 'maintenance' | 'upselling' | 'all';
  subcategory?: 'transportation' | 'excursions' | 'f_b' | 'affiliations';
  tags?: string[];
}): Promise<{ ok: boolean; error?: string; slug?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'full');
  if (!input.slug.match(/^[a-z0-9-]+$/)) return { ok: false, error: 'Slug must be lowercase a-z, 0-9, hyphen only' };
  const sb = supabaseAdmin();
  const { error } = await sb.from('beithady_sop_articles').insert({
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    body_md: input.body_md,
    language: input.language,
    kind: input.kind,
    role: input.role,
    subcategory: input.subcategory || null,
    tags: input.tags || [],
    status: 'published',
    author_user_id: user.id,
    updated_by_user_id: user.id,
    published_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/beithady/operations/sop');
  return { ok: true, slug: input.slug };
}
