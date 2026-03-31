-- ============================================================
--  LABOUR-APP SYSTEM
--  Migration: Multi-School Staff Management Schema
--  Date: 2026-03-07
--
--  Creates:
--    1. public.schools         — one row per registered school
--    2. public.staff_profiles  — one row per staff member (linked to auth.users)
--
--  Authentication strategy:
--    Staff log in using  Username + School Code + Password.
--    Internally, Supabase Auth stores the email as:
--      {username}@{school_code}.internal
--    This email is never exposed to the user.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- HELPER: a small utility function so RLS policies can easily
-- look up the school_id of whatever staff member is calling
-- the API without a nested sub-query on every policy.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_school_id()
  RETURNS UUID
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
AS $$
  SELECT school_id
  FROM   public.staff_profiles
  WHERE  id = auth.uid()
  LIMIT  1;
$$;

-- ────────────────────────────────────────────────────────────
-- HELPER: returns the role of the currently logged-in user.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_role()
  RETURNS TEXT
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
AS $$
  SELECT role
  FROM   public.staff_profiles
  WHERE  id = auth.uid()
  LIMIT  1;
$$;

-- ============================================================
-- TABLE 1: schools
-- ============================================================
CREATE TABLE IF NOT EXISTS public.schools (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name  TEXT        NOT NULL,
  school_code  TEXT        NOT NULL UNIQUE,   -- The public School ID used at login
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.schools                IS 'One row per registered school.';
COMMENT ON COLUMN public.schools.school_code    IS 'Public-facing School ID used on login screens (e.g. GHS-001).';

-- ============================================================
-- TABLE 2: staff_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  -- id mirrors the Supabase Auth user id created by the Edge Function
  id               UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,

  school_id        UUID        NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,

  username         TEXT        NOT NULL,
  full_name        TEXT        NOT NULL,
  gender           TEXT        CHECK (gender IN ('Male', 'Female', 'Other')),
  phone            TEXT,
  contact_email    TEXT,                         -- real email entered in the registration form
  auth_email       TEXT,                         -- internal login email: username@school_code.internal (never shown to user)
  qualification    TEXT,
  specialization   TEXT,
  role             TEXT        NOT NULL DEFAULT 'staff'
                               CHECK (role IN ('headteacher', 'staff')),
  address          TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Usernames must be unique within a school, but two schools can share the same username.
  CONSTRAINT uq_staff_username_per_school UNIQUE (school_id, username)
);

COMMENT ON TABLE  public.staff_profiles                    IS 'Staff member profiles. id is the Supabase Auth user UUID.';
COMMENT ON COLUMN public.staff_profiles.contact_email      IS 'Real email entered in the registration form. Used for contact/communications.';
COMMENT ON COLUMN public.staff_profiles.auth_email         IS 'Internal login email. Format: username@school_code.internal — never shown to user.';
COMMENT ON COLUMN public.staff_profiles.role               IS 'headteacher | staff';

-- Index to speed up school-scoped lookups (very common in all RLS policies)
CREATE INDEX IF NOT EXISTS idx_staff_profiles_school_id
  ON public.staff_profiles (school_id);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_school_username
  ON public.staff_profiles (school_id, username);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- ── schools ──────────────────────────────────────────────────
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Any authenticated staff can read the school row they belong to.
CREATE POLICY "Staff can view their own school"
  ON public.schools
  FOR SELECT
  USING (
    id = public.my_school_id()
  );

-- Only the Edge Function (service role, bypasses RLS) can INSERT/UPDATE schools.
-- No direct client-side INSERT allowed.

-- ── staff_profiles ───────────────────────────────────────────
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- Every authenticated user can read their own profile row.
CREATE POLICY "Staff can read their own profile"
  ON public.staff_profiles
  FOR SELECT
  USING (
    id = auth.uid()
  );

-- Headteacher can read ALL staff within their school.
CREATE POLICY "Headteacher can view all staff in their school"
  ON public.staff_profiles
  FOR SELECT
  USING (
    school_id = public.my_school_id()
    AND public.my_role() = 'headteacher'
  );

-- Staff can update only their own profile (e.g. address, phone).
CREATE POLICY "Staff can update their own profile"
  ON public.staff_profiles
  FOR UPDATE
  USING (
    id = auth.uid()
  )
  WITH CHECK (
    id = auth.uid()
    -- Prevent staff from self-promoting their role
    AND role = (SELECT role FROM public.staff_profiles WHERE id = auth.uid())
    -- Prevent staff from moving themselves to another school
    AND school_id = public.my_school_id()
  );

-- INSERT and DELETE are handled exclusively by the Edge Function with
-- service_role key — clients cannot create or delete staff directly.

-- ============================================================
-- GRANT PERMISSIONS
-- Grant only what authenticated clients need.
-- The service_role key (Edge Function) bypasses RLS automatically.
-- ============================================================
GRANT SELECT ON public.schools         TO authenticated;
GRANT SELECT, UPDATE ON public.staff_profiles TO authenticated;

-- The helper functions must be executable by authenticated users.
GRANT EXECUTE ON FUNCTION public.my_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_role()      TO authenticated;
