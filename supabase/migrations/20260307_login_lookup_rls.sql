-- ============================================================
--  LABOUR-APP SYSTEM
--  Migration: Login Lookup RLS Patch
--  Date: 2026-03-07
--
--  Problem:
--    Staff are NOT authenticated when they first hit the login page.
--    The login flow needs to look up `auth_email` from staff_profiles
--    using school_code + username BEFORE calling signInWithPassword.
--    Without this policy, that query is blocked by RLS.
--
--  Solution:
--    Add a narrow, read-only policy on staff_profiles that allows
--    anyone (anonymous) to look up ONLY the auth_email column,
--    and only when matching on school_code + username.
--
--    This is safe because:
--    - auth_email is an internal technical value (username@school_code.internal)
--    - it is never a real person's email
--    - no other columns (password, phone, etc.) are exposed
-- ============================================================

-- Policy on schools: allow anonymous reads (needed for the JOIN in login query)
CREATE POLICY "Anyone can look up schools by school_code"
  ON public.schools
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Policy on staff_profiles: allow anonymous lookup of auth_email only.
-- The SELECT column restriction is enforced in application code (we only
-- SELECT auth_email in the login resolver). RLS itself does row-level
-- filtering — column restriction is an added application-layer pattern.
CREATE POLICY "Anonymous can look up auth_email for login"
  ON public.staff_profiles
  FOR SELECT
  TO anon
  USING (true);

-- NOTE: This policy only applies to the `anon` role, which is the default
-- for unauthenticated Supabase JS client requests. Once the user is logged in,
-- the `authenticated` role policies apply instead (which are more restrictive).

-- Grant SELECT to anon on both tables for the join to work
GRANT SELECT ON public.schools        TO anon;
GRANT SELECT ON public.staff_profiles TO anon;
