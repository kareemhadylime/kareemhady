-- Phase: Personal Email v1.9 — demote Read: rule + work-route by company
--
-- User flagged that "Read: RE: ..." read receipts from FM+ employees
-- (william.attia@fmplusme.com etc.) were landing in Notifications
-- instead of FM+ Work. Cause: the seeded rule
--   priority 5  · subject "Read: " → notifications
-- fires before any work-routing rule (FM+ priority 15-18, Beithady 25,
-- KIKA 35). So a read-receipt about an FM+ ticket can never reach the
-- FM+ from_domain match.
--
-- Fix: demote the read-receipt rule to priority 90 (just above the
-- priority-98 owner-relative rule and the priority-99 List-Unsubscribe
-- fallback). Work-by-company routing now wins. Read receipts that
-- DON'T match any work rule still drop to notifications via the
-- demoted rule, just at the bottom of the precedence stack.

update public.personal_email_rules
set priority = 90,
    name = 'Gmail read-receipt prefix (fallback)'
where match_type = 'subject_contains'
  and match_value = 'Read: '
  and target_category = 'notifications';
