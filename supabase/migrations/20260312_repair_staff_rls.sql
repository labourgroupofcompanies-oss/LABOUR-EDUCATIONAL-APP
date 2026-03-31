-- ==============================================================================
-- 20260312_repair_staff_rls.sql
-- Description: Fixes RLS policies for staff_profiles to allow Headteachers to
-- legitimately read and update staff profiles within their own school.
-- ==============================================================================

-- 1) Drop existing policies if they exist so this file is retryable (idempotent)
DROP POLICY IF EXISTS "Headteacher can insert staff in their school" ON public.staff_profiles;
DROP POLICY IF EXISTS "Headteacher can update staff in their school" ON public.staff_profiles;
DROP POLICY IF EXISTS "Headteacher can view all staff in their school" ON public.staff_profiles;

-- 2) Re-create READ policy for headteachers (just to be safe and clear)
CREATE POLICY "Headteacher can view all staff in their school"
  ON public.staff_profiles FOR SELECT
  USING (
    school_id = public.my_school_id() 
    AND (public.my_role() = 'headteacher' OR public.my_role() = 'HEADTEACHER')
  );

-- 3) Create UPDATE policy for headteachers to modify their own school's staff
CREATE POLICY "Headteacher can update staff in their school"
  ON public.staff_profiles FOR UPDATE
  USING (
    school_id = public.my_school_id()
    AND (public.my_role() = 'headteacher' OR public.my_role() = 'HEADTEACHER')
  )
  WITH CHECK (
    school_id = public.my_school_id()
    AND (public.my_role() = 'headteacher' OR public.my_role() = 'HEADTEACHER')
  );

-- 4) (OPTIONAL/WARNING) Create INSERT policy for headteachers
-- **IMPORTANT BOOTSTRAP NOTE**: Even with this RLS policy, inserting a row 
-- directly from the frontend via supabase.from('staff_profiles').insert()
-- WILL FAIL with a Foreign Key Violation if the `id` does not already exist
-- in the secure `auth.users` table.
CREATE POLICY "Headteacher can insert staff in their school"
  ON public.staff_profiles FOR INSERT
  WITH CHECK (
    school_id = public.my_school_id()
    AND (public.my_role() = 'headteacher' OR public.my_role() = 'HEADTEACHER')
  );
