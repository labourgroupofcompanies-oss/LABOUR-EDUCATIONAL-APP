-- ==============================================================================
-- 20260331_fix_rls_recursion.sql
-- Description: 
--   1. Redefines my_school_id() and my_role() to use JWT app_metadata.
--   2. Eliminates infinite recursion in RLS policies.
--   3. Backfills app_metadata for all existing staff.
-- ==============================================================================

BEGIN;

-- ── 1. REDEFINE HELPER FUNCTIONS (JWT-BASED) ──────────────────────────────────
-- These functions no longer query the database, preventing RLS recursion.
-- They return NULL if metadata is missing, causing RLS to fail safely.

CREATE OR REPLACE FUNCTION public.my_school_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER 
SET search_path = public, pg_temp
AS $$
  SELECT (NULLIF(auth.jwt() -> 'app_metadata' ->> 'school_id', ''))::UUID;
$$;

CREATE OR REPLACE FUNCTION public.my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER 
SET search_path = public, pg_temp
AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role';
$$;

-- ── 2. METADATA BACKFILL (SYNC STAFF_PROFILES -> AUTH.USERS) ──────────────────
-- Ensures every authenticated user has the correct claims in their JWT.
-- This requires the service_role (Admin API) to actually take effect in Supabase,
-- but this SQL provides the heavy lifting for the database.

UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object(
  'school_id', sp.school_id,
  'role', LOWER(sp.role)
)
FROM public.staff_profiles sp
WHERE u.id = sp.id
AND (
  u.raw_app_meta_data ->> 'school_id' IS NULL 
  OR u.raw_app_meta_data ->> 'role' IS NULL
);

-- ── 3. DIAGNOSTIC VIEW (OPTIONAL) ───────────────────────────────────────────
-- Allows developers to quickly check their current claims.

CREATE OR REPLACE VIEW public.debug_my_claims AS
SELECT 
  auth.uid() as user_id,
  public.my_school_id() as school_id,
  public.my_role() as role,
  auth.jwt() -> 'app_metadata' as raw_metadata;

GRANT SELECT ON public.debug_my_claims TO authenticated;

COMMIT;

-- ── VERIFICATION QUERY ──────────────────────────────────────────────────────
-- Run this AFTER applying the script and logging out/in.
-- SELECT * FROM public.debug_my_claims;
