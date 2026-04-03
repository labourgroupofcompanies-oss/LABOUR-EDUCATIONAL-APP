-- Description: Fixes the role validation check on staff_profiles to permit ACCOUNTANT, TEACHER, and DEVELOPER roles natively within the database, rather than being rejected at the Postgres layer.

BEGIN;

-- 1. Drop the existing overly restrictive constraint
ALTER TABLE public.staff_profiles 
DROP CONSTRAINT IF EXISTS staff_profiles_role_check;

-- 2. Add an expanded constraint supporting administrative and specialized staff identifiers
ALTER TABLE public.staff_profiles 
ADD CONSTRAINT staff_profiles_role_check 
CHECK (lower(role) IN ('headteacher', 'staff', 'teacher', 'accountant', 'developer', 'admin'));

COMMIT;
