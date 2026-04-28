-- 0046_beithady_sop_kb.sql
--
-- Phase K.3 — Knowledge Base / SOP Library / Checklists for hospitality
-- roles. Single articles table covers SOPs, checklists, and KB articles.
-- Acknowledgement table tracks who has read each version.
--
-- Seed content covers all 5 roles (Reception · Guest Relations ·
-- Housekeeping · Maintenance · Upselling) plus an "all" cross-cutting
-- VIP protocol. Housekeeping articles are written in Arabic per
-- Phase K.1 brief language preference.
--
-- The actual seed INSERT is omitted from this file because it was
-- applied directly via the Supabase MCP (long article bodies are
-- inconvenient to keep in source control). The schema below is what
-- ships in repo.

CREATE TABLE IF NOT EXISTS beithady_sop_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  summary text,
  body_md text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','ar')),
  kind text NOT NULL CHECK (kind IN ('sop','checklist','kb')),
  role text NOT NULL CHECK (role IN ('reception','guest_relations','housekeeping','maintenance','upselling','all')),
  subcategory text CHECK (subcategory IS NULL OR subcategory IN ('transportation','excursions','f_b','affiliations')),
  tags text[] NOT NULL DEFAULT '{}',
  checklist_items jsonb,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  version integer NOT NULL DEFAULT 1,
  author_user_id uuid REFERENCES app_users(id),
  updated_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bsop_role ON beithady_sop_articles (role) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_bsop_kind ON beithady_sop_articles (kind) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_bsop_subcat ON beithady_sop_articles (subcategory) WHERE status = 'published' AND subcategory IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bsop_tags ON beithady_sop_articles USING gin (tags);

COMMENT ON TABLE beithady_sop_articles IS
'Knowledge base articles, SOPs, and checklists for hospitality roles. body_md is markdown.';

CREATE TABLE IF NOT EXISTS beithady_sop_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES beithady_sop_articles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  version_acknowledged integer NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, user_id, version_acknowledged)
);

CREATE INDEX IF NOT EXISTS idx_bsop_ack_user ON beithady_sop_acknowledgments (user_id);
CREATE INDEX IF NOT EXISTS idx_bsop_ack_article ON beithady_sop_acknowledgments (article_id);
