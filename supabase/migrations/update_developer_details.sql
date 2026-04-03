-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATED DEVELOPER PROFILE RECOVERY & LOGIN REPAIR SCRIPT
-- ─────────────────────────────────────────────────────────────────────────────
-- This script:
--  1. Ensures the 'SYSTEM' school exists.
--  2. Links your Developer account correctly to that school.
--  3. Re-deploys the login lookup function (resolve_auth_email).
--  4. Resets the password to 'iwillberich@30'
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- 1. Ensure the "System Administration" school exists
-- If 'SYSTEM' already exists, we keep its current ID to avoid FK errors.
INSERT INTO public.schools (id, school_name, school_code)
VALUES ('00000000-0000-0000-0000-000000000000', 'System Administration', 'SYSTEM')
ON CONFLICT (school_code) DO NOTHING;

-- 2. Catch the correct school ID for 'SYSTEM'
DO $$
DECLARE
    target_school_id UUID;
    dev_auth_id UUID := '99999215-05e5-448f-ab53-77855d838b9d'; -- <--- ENSURE THIS MATCHES YOUR AUTH ID
BEGIN
    SELECT id INTO target_school_id FROM public.schools WHERE school_code = 'SYSTEM' LIMIT 1;

    -- 3. Restore/Update the staff profile using the correct school_id
    INSERT INTO public.staff_profiles (
        id,
        school_id,
        username,
        full_name,
        role,
        auth_email
    )
    VALUES (
        dev_auth_id, 
        target_school_id,
        'Jehoveristheking', 
        'Ayanuvi Godsway', 
        'developer', 
        'admin@labourapp.com'
    )
    ON CONFLICT (id) DO UPDATE SET
        role = 'developer',
        school_id = target_school_id,
        username = 'Jehoveristheking',
        auth_email = 'admin@labourapp.com';

    -- 4. Reset Developer Password in auth.users
    UPDATE auth.users 
    SET encrypted_password = crypt('iwillberich@30', gen_salt('bf'))
    WHERE id = dev_auth_id;
END $$;

-- 5. RE-DEPLOY LOGIN LOOKUP FUNCTION
-- This is what LoginPage.tsx calls to find your email before signing in.
CREATE OR REPLACE FUNCTION public.resolve_auth_email(
  p_school_code TEXT,
  p_username    TEXT
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT sp.auth_email
  FROM   public.staff_profiles sp
  JOIN   public.schools s ON s.id = sp.school_id
  WHERE  LOWER(s.school_code) = LOWER(p_school_code)
  AND    LOWER(sp.username)   = LOWER(p_username)
  LIMIT  1;
$$;

-- 6. Grant EXECUTE to 'anon' (ensures unauthenticated login screen can call it)
REVOKE EXECUTE ON FUNCTION public.resolve_auth_email(TEXT, TEXT) FROM authenticated, public;
GRANT EXECUTE ON FUNCTION public.resolve_auth_email(TEXT, TEXT) TO anon;

-- 7. Ensure role constraint allows 'developer'
ALTER TABLE public.staff_profiles 
DROP CONSTRAINT IF EXISTS staff_profiles_role_check;

ALTER TABLE public.staff_profiles
ADD CONSTRAINT staff_profiles_role_check 
CHECK (lower(role) IN ('headteacher', 'staff', 'teacher', 'accountant', 'developer', 'admin'));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERY
-- Run this after running the script above. 
-- It should return 'admin@labourapp.com'
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT public.resolve_auth_email('SYSTEM', 'Jehoveristheking');
