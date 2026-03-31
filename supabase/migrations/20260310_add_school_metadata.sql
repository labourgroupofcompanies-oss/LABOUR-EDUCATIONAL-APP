-- ============================================================
-- SQL Migration: Add School Metadata & Logo Support
-- Date: 2026-03-10
-- ============================================================

-- Add missing columns to public.schools
ALTER TABLE public.schools 
  ADD COLUMN IF NOT EXISTS logo              TEXT,
  ADD COLUMN IF NOT EXISTS school_type      TEXT,
  ADD COLUMN IF NOT EXISTS region           TEXT,
  ADD COLUMN IF NOT EXISTS district         TEXT,
  ADD COLUMN IF NOT EXISTS headteacher_name TEXT,
  ADD COLUMN IF NOT EXISTS email            TEXT,
  ADD COLUMN IF NOT EXISTS address          TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();

-- Update comment for the new logo column
COMMENT ON COLUMN public.schools.logo IS 'Base64 encoded string of the school logo (syncs from Dexie Blob).';

-- Add RLS policy for headteacher to update their own school details
CREATE POLICY "Headteachers can update their own school" 
  ON public.schools
  FOR UPDATE
  USING (
    id = public.my_school_id() 
    AND public.my_role() = 'headteacher'
  )
  WITH CHECK (
    id = public.my_school_id()
  );

-- Grant update permissions to authenticated users (restricted by RLS)
GRANT UPDATE ON public.schools TO authenticated;
