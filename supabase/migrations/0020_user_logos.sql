-- Phase: Per-broker logo for Boat Catalogue PDF header.
--
-- Brokers can have a logo uploaded by admin (Users page). When a broker
-- generates a one-page A4 PDF spec sheet from the Boat Catalogue, this
-- logo appears in the header instead of any platform branding. Owners
-- and admins use the same column if ever needed but the upload UI is
-- broker-only for now (W1).
--
-- Storage: 'boat-rental' bucket, key 'user-logos/{user_id}/{uuid}.{ext}'.
-- Render: object-contain in a fixed-aspect slot, so any uploaded image
-- format/dimensions fits without server-side processing.

alter table public.app_users
  add column if not exists logo_path text;
