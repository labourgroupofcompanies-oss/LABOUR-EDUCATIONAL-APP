-- supabase/migrations/repair_staff_metadata.sql
-- This script fixes staff accounts that were created without proper app_metadata
-- or were left in an unconfirmed state.

-- 1. Identify users with role/school_id in user_metadata but not in app_metadata
UPDATE auth.users
SET 
  raw_app_meta_data = raw_app_meta_data || 
    jsonb_build_object(
      'role', raw_user_meta_data->>'role',
      'school_id', raw_user_meta_data->>'school_id'
    ),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()), -- Auto-confirm if not confirmed
  updated_at = NOW()
WHERE 
  (raw_user_meta_data->>'role' IS NOT NULL OR raw_user_meta_data->>'school_id' IS NOT NULL)
  AND (
    raw_app_meta_data->>'role' IS NULL 
    OR raw_app_meta_data->>'school_id' IS NULL
    OR email_confirmed_at IS NULL
  );

-- 2. Verify specifically for teacher 'ama' if needed (optional logging)
-- This query helps confirm who was updated
SELECT id, email, raw_app_meta_data->>'role' as role, raw_app_meta_data->>'school_id' as school_id, email_confirmed_at
FROM auth.users
WHERE email LIKE 'ama.%@labourapp.com';
