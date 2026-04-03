-- ============================================================
-- SQL REPAIR: Restore Login Lookup Mechanism
-- Fixes "400 Bad Request" in LoginPage.tsx
-- Date: 2026-03-31
-- ============================================================

BEGIN;

-- 1. Ensure the 'schools' table has 'school_code' (conceptually School ID)
--    If it's currently named 'school_id', rename it back to 'school_code'.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'schools' AND column_name = 'school_id'
    ) AND NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'schools' AND column_name = 'school_code'
    ) THEN
        ALTER TABLE public.schools RENAME COLUMN school_id TO school_code;
    END IF;
END $$;

-- 2. Create index for fast login lookups (Postgres lower case)
CREATE INDEX IF NOT EXISTS idx_schools_school_code_lower ON public.schools (LOWER(school_code));

-- 3. Restore the 'resolve_auth_email' RPC function
--    This is called by LoginPage.tsx BEFORE the user is signed in.
--    It MUST be SECURITY DEFINER to bypass RLS and return the internal email.
CREATE OR REPLACE FUNCTION public.resolve_auth_email(
  p_school_code TEXT,
  p_username    TEXT
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp   -- prevents search_path injection
AS $$
  SELECT sp.auth_email
  FROM   public.staff_profiles sp
  JOIN   public.schools s ON s.id = sp.school_id
  WHERE  LOWER(s.school_code) = LOWER(p_school_code)
  AND    LOWER(sp.username)   = LOWER(p_username)
  LIMIT  1;
$$;

-- 4. Grant EXECUTE to 'anon' (unauthenticated users)
--    The login screen allows ANYONE to try resolving an email before signing in.
REVOKE EXECUTE ON FUNCTION public.resolve_auth_email(TEXT, TEXT) FROM authenticated, public;
GRANT EXECUTE ON FUNCTION public.resolve_auth_email(TEXT, TEXT) TO anon;

COMMIT;

-- VERIFICATION:
-- SELECT public.resolve_auth_email('YOUR-SCHOOL-CODE', 'YOUR-USERNAME');
