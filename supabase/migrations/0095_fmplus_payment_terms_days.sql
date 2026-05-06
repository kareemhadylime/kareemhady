-- supabase/migrations/0095_fmplus_payment_terms_days.sql
-- Convert project_contracts.payment_terms (free text) → payment_terms_days (int).
-- Keeps the old text column for historical reference; the UI + report renderer
-- now use the numeric column so future code can compute AR aging vs payment terms.

ALTER TABLE public.project_contracts
  ADD COLUMN IF NOT EXISTS payment_terms_days integer;

-- Backfill: extract the first integer found in the existing free-text payment_terms.
-- "Net 60 Days From Invoice Submission" → 60
-- "30 days net" → 30
-- NULL or no integer → NULL
UPDATE public.project_contracts
   SET payment_terms_days =
        nullif((regexp_match(payment_terms, '(\d+)'))[1], '')::integer
 WHERE payment_terms_days IS NULL
   AND payment_terms IS NOT NULL;

COMMENT ON COLUMN public.project_contracts.payment_terms_days IS
  'Number of days between invoice submission and payment due. Used to flag overdue AR.';
