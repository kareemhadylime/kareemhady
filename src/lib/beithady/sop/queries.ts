import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type SopRole = 'reception' | 'guest_relations' | 'housekeeping' | 'maintenance' | 'upselling' | 'all';
export type SopSubcategory = 'transportation' | 'excursions' | 'f_b' | 'affiliations';
export type SopKind = 'sop' | 'checklist' | 'kb';

export type SopArticleListItem = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  language: 'en' | 'ar';
  kind: SopKind;
  role: SopRole;
  subcategory: SopSubcategory | null;
  tags: string[];
  version: number;
  updated_at: string;
};

export type SopArticleDetail = SopArticleListItem & {
  body_md: string;
  checklist_items: Array<{ id?: string; text: string; photo_required?: boolean }> | null;
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  acknowledged_by_me: boolean;
  ack_count: number;
};

export const ROLE_LABEL_EN: Record<SopRole, string> = {
  reception: 'Reception',
  guest_relations: 'Guest Relations',
  housekeeping: 'Housekeeping',
  maintenance: 'Maintenance',
  upselling: 'Upselling',
  all: 'All roles',
};

export const ROLE_LABEL_AR: Record<SopRole, string> = {
  reception: 'الاستقبال',
  guest_relations: 'علاقات الضيوف',
  housekeeping: 'الإشراف الداخلي',
  maintenance: 'الصيانة',
  upselling: 'البيع الإضافي',
  all: 'جميع الأدوار',
};

export const SUBCATEGORY_LABEL: Record<SopSubcategory, { en: string; ar: string; emoji: string }> = {
  transportation: { en: 'Transportation', ar: 'المواصلات', emoji: '🚗' },
  excursions:     { en: 'Excursions',     ar: 'الرحلات',     emoji: '🏛' },
  f_b:            { en: 'F&B',            ar: 'الطعام',      emoji: '🍽' },
  affiliations:   { en: 'Affiliations',   ar: 'شراكات',      emoji: '🏥' },
};

export async function listArticles(opts: {
  role?: SopRole;
  subcategory?: SopSubcategory;
  kind?: SopKind;
  search?: string;
}): Promise<SopArticleListItem[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_sop_articles')
    .select('id, slug, title, summary, language, kind, role, subcategory, tags, version, updated_at')
    .eq('status', 'published')
    .order('role')
    .order('title');
  if (opts.role) q = q.in('role', [opts.role, 'all']);
  if (opts.subcategory) q = q.eq('subcategory', opts.subcategory);
  if (opts.kind) q = q.eq('kind', opts.kind);
  const { data } = await q;
  let rows = (data as SopArticleListItem[] | null) || [];
  if (opts.search) {
    const term = opts.search.toLowerCase();
    rows = rows.filter(r =>
      r.title.toLowerCase().includes(term)
      || (r.summary || '').toLowerCase().includes(term)
      || r.tags.some(t => t.toLowerCase().includes(term))
    );
  }
  return rows;
}

export async function getArticle(slug: string, currentUserId?: string): Promise<SopArticleDetail | null> {
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('beithady_sop_articles')
    .select('id, slug, title, summary, language, kind, role, subcategory, tags, version, updated_at, body_md, checklist_items, status, published_at')
    .eq('slug', slug)
    .maybeSingle();
  if (!row) return null;
  const r = row as Omit<SopArticleDetail, 'acknowledged_by_me' | 'ack_count'>;

  const [{ count: ackCount }, { data: myAck }] = await Promise.all([
    sb.from('beithady_sop_acknowledgments')
      .select('id', { count: 'exact', head: true })
      .eq('article_id', r.id)
      .eq('version_acknowledged', r.version),
    currentUserId
      ? sb.from('beithady_sop_acknowledgments')
          .select('id')
          .eq('article_id', r.id)
          .eq('user_id', currentUserId)
          .eq('version_acknowledged', r.version)
          .maybeSingle()
      : { data: null },
  ]);

  return {
    ...r,
    acknowledged_by_me: Boolean(myAck),
    ack_count: ackCount || 0,
  };
}

export async function listAllRoleCounts(): Promise<Record<SopRole, number>> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_sop_articles')
    .select('role')
    .eq('status', 'published');
  const counts: Record<SopRole, number> = {
    reception: 0, guest_relations: 0, housekeeping: 0, maintenance: 0, upselling: 0, all: 0,
  };
  for (const r of (data as Array<{ role: SopRole }> | null) || []) {
    counts[r.role] = (counts[r.role] || 0) + 1;
  }
  return counts;
}
