-- ==============================================================================
-- Migration: Delete All Users Except Developer
-- Description: Safely removes all personnel from auth.users and staff_profiles,
--              leaving only the developer account active.
-- ==============================================================================

BEGIN;

-- 1. Delete all staff profiles EXCEPT developers
DELETE FROM public.staff_profiles 
WHERE role != 'developer' 
   OR role IS NULL;

-- 2. Delete all users from auth.users EXCEPT the developer ('admin@labourapp.com' or matching the remaining staff_profiles)
DELETE FROM auth.users 
WHERE email != 'admin@labourapp.com'
  AND id NOT IN (
      SELECT id FROM public.staff_profiles WHERE role = 'developer'
  );

-- Note: Any records in students, classes, subjects, etc. created by these users
-- will remain unless they have ON DELETE CASCADE foreign keys linked to the user.
-- If you want a COMPLETELY fresh database (wiping students/schools too), 
-- you would need to truncate those tables as well.

COMMIT;
