-- ============================================================
--  LABOUR-APP SYSTEM
--  Migration: Developer Role & System Administration Onboarding
--  Date: 2026-03-10
-- ============================================================

BEGIN;

-- 1. Update the staff_profiles role check constraint to include 'developer'
ALTER TABLE public.staff_profiles 
DROP CONSTRAINT IF EXISTS staff_profiles_role_check;

ALTER TABLE public.staff_profiles
ADD CONSTRAINT staff_profiles_role_check 
CHECK (role IN ('headteacher', 'staff', 'developer'));

-- 2. Create the "System Administration" school
-- Using a fixed UUID so it's predictable for setup scripts
DO $$
DECLARE
  v_school_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  INSERT INTO public.schools (id, school_name, school_code)
  VALUES (v_school_id, 'System Administration', 'SYSTEM')
  ON CONFLICT (school_code) DO NOTHING;
END $$;

-- 3. Instructions for the user:
-- Since creating an auth.users record requires access to the auth schema (usually restricted)
-- and specific password hashing, we recommend you:
--   a) Create a user in the Supabase Dashboard (Authentication > Users)
--   b) Copy the UUID of that new user
--   c) Run the following SQL replacing 'PASTE_AUTH_USER_ID_HERE' with your UUID:

/*
  INSERT INTO public.staff_profiles (
      id,
      school_id,
      username,
      full_name,
      role,
      auth_email
  )
  VALUES (
      'PASTE_AUTH_USER_ID_HERE',
      '00000000-0000-0000-0000-000000000000',
      'Jehoveristheking',
      'System Developer',
      'developer',
      'jehoveristheking@system.internal'
  );
*/

COMMIT;
