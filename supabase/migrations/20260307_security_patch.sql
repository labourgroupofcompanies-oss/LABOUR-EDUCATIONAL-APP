-- ============================================================
--  LABOUR-APP SYSTEM
--  Security Patch: Login Lookup — Safe RLS
--  Date: 2026-03-07
--
--  Replaces the overly broad anonymous RLS policy with a
--  SECURITY DEFINER function that returns ONLY the auth_email
--  for a specific school_code + username pair.
--
--  Anonymous users can ONLY call this function — they cannot
--  SELECT from schools or staff_profiles directly.
-- ============================================================

-- ── Step 1: Drop the old broad policies ──────────────────────
DROP POLICY IF EXISTS "Anonymous can look up auth_email for login" ON public.staff_profiles;
DROP POLICY IF EXISTS "Anyone can look up schools by school_code"  ON public.schools;

-- ── Step 2: Revoke the broad anon SELECT grants ───────────────
REVOKE SELECT ON public.staff_profiles FROM anon;
REVOKE SELECT ON public.schools         FROM anon;

-- ── Step 3: Create a safe, narrow lookup function ─────────────
-- This runs as the function owner (SECURITY DEFINER) and returns
-- ONLY the auth_email for the exact school+username combination.
-- Anonymous callers never touch the table directly.
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

-- Allow ONLY anonymous (unauthenticated) users to call this function
-- Authenticated users already have full profile access via their RLS policies
GRANT EXECUTE ON FUNCTION public.resolve_auth_email(TEXT, TEXT) TO anon;

-- ── Step 4: Fix the SECURITY DEFINER search_path on helper functions ──
-- Prevents search_path injection attacks on these functions.
CREATE OR REPLACE FUNCTION public.my_school_id()
  RETURNS UUID
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT school_id
  FROM   public.staff_profiles
  WHERE  id = auth.uid()
  LIMIT  1;
$$;

CREATE OR REPLACE FUNCTION public.my_role()
  RETURNS TEXT
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT role
  FROM   public.staff_profiles
  WHERE  id = auth.uid()
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_auth_email(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.my_school_id()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_role()                       TO authenticated;
