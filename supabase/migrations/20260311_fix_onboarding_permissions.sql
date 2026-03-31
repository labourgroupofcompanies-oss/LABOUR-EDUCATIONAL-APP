-- ============================================================
-- SQL Migration: Onboarding Permissions Fix
-- Date: 2026-03-11
--
-- Enables client-side onboarding by allowing:
-- 1. Anonymous users to INSERT into public.schools.
-- 2. Authenticated users to INSERT their own profile into staff_profiles.
-- ============================================================

-- ── 1. Permissions for 'schools' table ───────────────────────

-- Allow anonymous users to register a new school
CREATE POLICY "Enable anonymous school registration"
  ON public.schools
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Ensure anon role has insert permissions
GRANT INSERT ON public.schools TO anon, authenticated;


-- ── 2. Permissions for 'staff_profiles' table ────────────────

-- Allow users to create their own profile after signing up
CREATE POLICY "Enable profile creation for own user"
  ON public.staff_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Ensure authenticated role has insert permissions
GRANT INSERT ON public.staff_profiles TO authenticated;

-- Ensure authenticated users can also look up schools (needed for onboarding completion)
GRANT SELECT ON public.schools TO authenticated;
