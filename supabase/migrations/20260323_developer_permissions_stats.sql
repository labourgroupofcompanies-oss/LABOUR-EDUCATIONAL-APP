-- ============================================================
-- SQL Migration: Add Developer Permissions for School Stats
-- Date: 2026-03-23
-- ============================================================

BEGIN;

-- 1. Allow Developers to SELECT from staff_profiles
DROP POLICY IF EXISTS "Developers can view all staff profiles" ON public.staff_profiles;
CREATE POLICY "Developers can view all staff profiles"
  ON public.staff_profiles
  FOR SELECT
  USING (
    public.my_role() = 'developer' OR auth.jwt()->>'email' = 'admin@labourapp.com'
  );

-- 2. Allow Developers to SELECT from students
DROP POLICY IF EXISTS "Developers can view all students" ON public.students;
CREATE POLICY "Developers can view all students"
  ON public.students
  FOR SELECT
  USING (
    public.my_role() = 'developer' OR auth.jwt()->>'email' = 'admin@labourapp.com'
  );

-- 3. Allow Developers to SELECT from results
DROP POLICY IF EXISTS "Developers can view all results" ON public.results;
CREATE POLICY "Developers can view all results"
  ON public.results
  FOR SELECT
  USING (
    public.my_role() = 'developer' OR auth.jwt()->>'email' = 'admin@labourapp.com'
  );

COMMIT;
