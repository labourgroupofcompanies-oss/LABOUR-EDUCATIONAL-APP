-- ============================================================
-- SQL Migration: Consolidated School Metadata Fix
-- Date: 2026-03-11
--
-- Adds ALL required columns to public.schools in case they
-- were lost due to a table reset (e.g. FRESH_START.sql).
-- ============================================================

ALTER TABLE public.schools 
  ADD COLUMN IF NOT EXISTS logo                      TEXT,
  ADD COLUMN IF NOT EXISTS school_type              TEXT,
  ADD COLUMN IF NOT EXISTS region                   TEXT,
  ADD COLUMN IF NOT EXISTS district                 TEXT,
  ADD COLUMN IF NOT EXISTS headteacher_name         TEXT,
  ADD COLUMN IF NOT EXISTS email                    TEXT,
  ADD COLUMN IF NOT EXISTS address                  TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_term          TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_academic_year TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at               TIMESTAMPTZ DEFAULT NOW();

-- Add comments for clarity
COMMENT ON COLUMN public.schools.logo IS 'Storage path or Base64 for the school logo.';
COMMENT ON COLUMN public.schools.onboarding_term IS 'The term the school started on the system.';
COMMENT ON COLUMN public.schools.onboarding_academic_year IS 'The academic year the school started on the system.';

-- Force a schema cache reload (PostgREST)
-- Note: In the Supabase Dashboard, this happens automatically, 
-- but running a dummy 'NOTIFY' or just altering the table usually triggers it.
NOTIFY pgrst, 'reload schema';
