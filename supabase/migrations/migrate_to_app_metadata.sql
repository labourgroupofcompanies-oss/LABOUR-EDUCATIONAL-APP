-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  SECURITY MIGRATION: Move role & school_id to app_metadata      ║
-- ║  Run ONCE in Supabase Dashboard → SQL Editor                    ║
-- ║  This requires the service role key — DO NOT run from frontend  ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Copy role + school_id from user_metadata → app_metadata
-- This ensures RLS policies reading app_metadata work for ALL existing users.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
    || jsonb_build_object(
        'school_id', raw_user_meta_data->>'school_id',
        'role',      raw_user_meta_data->>'role'
    )
WHERE
    raw_user_meta_data->>'school_id' IS NOT NULL
    OR raw_user_meta_data->>'role' IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Verify — list all users and their metadata after migration
-- Inspect the output to ensure app_metadata now contains role and school_id
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    id,
    email,
    raw_user_meta_data->>'role'      AS meta_role,
    raw_user_meta_data->>'school_id' AS meta_school_id,
    raw_app_meta_data->>'role'       AS app_role,
    raw_app_meta_data->>'school_id'  AS app_school_id
FROM auth.users
ORDER BY created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: For ALL future user registrations, you MUST set app_metadata at 
-- creation time. Use the Supabase Admin API or a server-side function:
--
--   supabase.auth.admin.createUser({
--     email: '...',
--     password: '...',
--     app_metadata: { role: 'TEACHER', school_id: 'SCH-...' },
--     user_metadata: { full_name: '...', username: '...' }
--   })
--
-- Only app_metadata is truly server-controlled. user_metadata can be
-- changed by the user themselves via supabase.auth.updateUser().
-- ─────────────────────────────────────────────────────────────────────────────
