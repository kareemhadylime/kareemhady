-- 0044_beithady_morning_brief.sql
--
-- Phase K.1 — Daily Morning Brief.
--
-- Three role-specific briefs (Guest Relations, Ops, Finance) sent at
-- 8am Cairo via WhatsApp + email + web archive.
--
-- Recipients = auto-broadcast to all users with a matching
-- beithady_user_role (resolved in code) PLUS any admin-added extras
-- in beithady_morning_brief_extras (people without app_users accounts:
-- owner's accountant, external consultant, on-call WhatsApp number).

CREATE TABLE IF NOT EXISTS beithady_morning_brief_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('guest_relations','ops','finance')),
  label text NOT NULL,
  email text,
  whatsapp text,
  enabled boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR whatsapp IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_bmbe_role
  ON beithady_morning_brief_extras (role) WHERE enabled;

COMMENT ON TABLE beithady_morning_brief_extras IS
'Admin-curated extra recipients for the Daily Morning Brief, on top of the auto-broadcast to users with the matching beithady_user_role.';

CREATE TABLE IF NOT EXISTS beithady_morning_brief_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  role text NOT NULL CHECK (role IN ('guest_relations','ops','finance')),
  recipients_count integer NOT NULL DEFAULT 0,
  delivered_email integer NOT NULL DEFAULT 0,
  delivered_whatsapp integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  errors jsonb,
  brief_summary jsonb,
  rendered_markdown text,
  rendered_html text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','partial','failed','skipped')),
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_date, role)
);

CREATE INDEX IF NOT EXISTS idx_bmbl_run_date
  ON beithady_morning_brief_log (run_date DESC, role);

COMMENT ON TABLE beithady_morning_brief_log IS
'Per-day per-role delivery log + rendered brief archive.';
