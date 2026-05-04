-- =====================================================================
-- Phase F (F&B v1) — add fnb_manager to beithady_role enum
-- =====================================================================
-- Mirrors the pattern of 0048a (warehouse_manager + housekeeper) and
-- 0060 (business_analyst). The PERMISSIONS matrix update lives in TS
-- (src/lib/beithady/auth.ts) and ships in Task 7.

ALTER TYPE public.beithady_role ADD VALUE IF NOT EXISTS 'fnb_manager';
