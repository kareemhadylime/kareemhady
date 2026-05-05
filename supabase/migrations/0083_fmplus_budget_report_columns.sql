-- 0083_fmplus_budget_report_columns.sql
-- Adds the columns + tables required by the FM+ Project Report tab:
--   * customer_logo_url, customer_contacts, payment_terms, scope_summary on project_contracts
--   * project_year_signoffs (sign-off history per year)
--   * budget_report_exports (audit log per PDF download)
-- See spec: docs/superpowers/specs/2026-05-05-fmplus-project-report-design.md §6.

ALTER TABLE public.project_contracts
  ADD COLUMN IF NOT EXISTS customer_logo_url   text,
  ADD COLUMN IF NOT EXISTS customer_contacts   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_terms       text,
  ADD COLUMN IF NOT EXISTS scope_summary       text;

CREATE TABLE IF NOT EXISTS public.project_year_signoffs (
  id           bigserial PRIMARY KEY,
  year_id      bigint NOT NULL REFERENCES public.project_years(id) ON DELETE CASCADE,
  signed_by    uuid NOT NULL REFERENCES auth.users(id),
  signed_role  text NOT NULL CHECK (signed_role IN
                  ('project_manager','finance_director','fmplus_signatory','customer_signatory')),
  signed_at    timestamptz NOT NULL DEFAULT now(),
  mode         text NOT NULL CHECK (mode IN ('pre','signoff','customer','snapshot')),
  notes        text
);
CREATE INDEX IF NOT EXISTS project_year_signoffs_year_idx
  ON public.project_year_signoffs (year_id, signed_at DESC);

CREATE TABLE IF NOT EXISTS public.budget_report_exports (
  id          bigserial PRIMARY KEY,
  year_id     bigint NOT NULL REFERENCES public.project_years(id) ON DELETE CASCADE,
  contract_id bigint NOT NULL REFERENCES public.project_contracts(id) ON DELETE CASCADE,
  mode        text NOT NULL CHECK (mode IN ('pre','signoff','customer','snapshot')),
  lang        text NOT NULL CHECK (lang IN ('en','ar','both')),
  exported_by uuid NOT NULL REFERENCES auth.users(id),
  exported_at timestamptz NOT NULL DEFAULT now(),
  user_agent  text
);
CREATE INDEX IF NOT EXISTS budget_report_exports_year_idx
  ON public.budget_report_exports (year_id, exported_at DESC);
CREATE INDEX IF NOT EXISTS budget_report_exports_contract_idx
  ON public.budget_report_exports (contract_id, exported_at DESC);
