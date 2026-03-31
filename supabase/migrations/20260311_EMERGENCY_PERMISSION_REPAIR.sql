-- ============================================================
-- SQL Migration: EMERGENCY SECURITY & PERMISSION REPAIR
-- Date: 2026-03-11
--
-- This script fixes "401 Unauthorized" and "Permission Denied" 
-- errors by ensuring the 'anon' and 'authenticated' roles 
-- have the absolute minimum permissions needed to onboard.
-- ============================================================

-- ── 1. SCHEMA USAGE ──────────────────────────────────────────
-- Ensure roles can even "see" that the public schema exists
GRANT USAGE ON SCHEMA public TO anon, authenticated;


-- ── 2. SCHOOLS TABLE PERMISSIONS ──────────────────────────────

-- Allow anon to see and insert (needed for the onboarding form)
GRANT SELECT, INSERT ON public.schools TO anon, authenticated;

-- If you are using UUIDs as primary keys with gen_random_uuid(), 
-- you don't need sequence permissions, but let's be safe for any others.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable anonymous school registration" ON public.schools;
DROP POLICY IF EXISTS "Anyone can look up schools by school_code" ON public.schools;

-- RLS Policy: Allow anyone to Register (Insert)
CREATE POLICY "Onboarding: Allow school registration"
  ON public.schools
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- RLS Policy: Allow anyone to Look up (needed for login and insert-verification)
CREATE POLICY "Onboarding: Allow school lookup"
  ON public.schools
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- ── 3. STAFF PROFILES PERMISSIONS ────────────────────────────

-- Ensure authenticated users can create their own profile post-signup
GRANT INSERT, SELECT, UPDATE ON public.staff_profiles TO authenticated;

-- Ensure anon can look up for login purposes
GRANT SELECT ON public.staff_profiles TO anon;

DROP POLICY IF EXISTS "Enable profile creation for own user" ON public.staff_profiles;
DROP POLICY IF EXISTS "Anonymous can look up auth_email for login" ON public.staff_profiles;

CREATE POLICY "Onboarding: Allow profile creation"
  ON public.staff_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ── 4. REFRESH CACHE ─────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
