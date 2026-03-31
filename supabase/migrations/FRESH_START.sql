-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  LABOUR-APP SYSTEM — NUCLEAR FRESH START                           ║
-- ║  Run this ONCE in Supabase Dashboard → SQL Editor                  ║
-- ║  ⚠️  THIS IS IRREVERSIBLE. There is no undo.                       ║
-- ╚══════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ─── STEP 1: Drop ALL old helper functions ────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_school_id() CASCADE;
DROP FUNCTION IF EXISTS public.my_role()      CASCADE;

-- ─── STEP 2: Drop ALL old application tables (CASCADE handles FK order) ───────
DROP TABLE IF EXISTS public.component_scores     CASCADE;
DROP TABLE IF EXISTS public.results              CASCADE;
DROP TABLE IF EXISTS public.attendance           CASCADE;
DROP TABLE IF EXISTS public.assessment_configs   CASCADE;
DROP TABLE IF EXISTS public.fee_payments         CASCADE;
DROP TABLE IF EXISTS public.fee_structures       CASCADE;
DROP TABLE IF EXISTS public.payroll_records      CASCADE;
DROP TABLE IF EXISTS public.expenses             CASCADE;
DROP TABLE IF EXISTS public.settings             CASCADE;
DROP TABLE IF EXISTS public.students             CASCADE;
DROP TABLE IF EXISTS public.classes              CASCADE;
DROP TABLE IF EXISTS public.subjects             CASCADE;
DROP TABLE IF EXISTS public.school_subscriptions CASCADE;
DROP TABLE IF EXISTS public.staff_profiles       CASCADE;
DROP TABLE IF EXISTS public.users                CASCADE;
DROP TABLE IF EXISTS public.schools              CASCADE;

-- ─── STEP 3: Delete ALL Supabase Auth users ──────────────────────────────────
DELETE FROM auth.users;

-- ─── STEP 4: Create tables FIRST (functions must come after) ─────────────────

-- ── TABLE: schools ────────────────────────────────────────────────────────────
CREATE TABLE public.schools (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name  TEXT        NOT NULL,
  school_code  TEXT        NOT NULL UNIQUE,  -- Public School ID used on login screen (e.g. GHS-001)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.schools             IS 'One row per registered school.';
COMMENT ON COLUMN public.schools.school_code IS 'Public-facing School ID shown on the login screen.';

-- ── TABLE: staff_profiles ─────────────────────────────────────────────────────
CREATE TABLE public.staff_profiles (
  -- id mirrors the Supabase Auth user UUID — set exclusively by the Edge Function
  id             UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,

  school_id      UUID        NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,

  username       TEXT        NOT NULL,
  full_name      TEXT        NOT NULL,
  gender         TEXT        CHECK (gender IN ('Male', 'Female', 'Other')),
  phone          TEXT,

  contact_email  TEXT,   -- real email entered in the registration form
  auth_email     TEXT,   -- internal: username@school_code.internal (never shown to user)

  qualification  TEXT,
  specialization TEXT,
  role           TEXT        NOT NULL DEFAULT 'staff'
                             CHECK (role IN ('headteacher', 'staff')),
  address        TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Usernames are unique per school only
  CONSTRAINT uq_staff_username_per_school UNIQUE (school_id, username)
);

COMMENT ON TABLE  public.staff_profiles                IS 'Staff profiles. id = Supabase Auth user UUID (set by Edge Function only).';
COMMENT ON COLUMN public.staff_profiles.contact_email  IS 'Real email from the registration form. Used for communications.';
COMMENT ON COLUMN public.staff_profiles.auth_email     IS 'Internal: username@school_code.internal — never shown to the user.';
COMMENT ON COLUMN public.staff_profiles.role           IS 'headteacher | staff';

-- Indexes for fast school-scoped lookups (used by every RLS policy)
CREATE INDEX idx_staff_profiles_school_id       ON public.staff_profiles (school_id);
CREATE INDEX idx_staff_profiles_school_username ON public.staff_profiles (school_id, username);

-- ─── STEP 5: Create helper functions (tables now exist — safe to reference) ───

-- Returns the school_id of the currently logged-in user
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

-- Returns the role of the currently logged-in user
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

-- ─── STEP 6: Enable Row Level Security ───────────────────────────────────────
ALTER TABLE public.schools        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies: schools ─────────────────────────────────────────────────────
CREATE POLICY "Staff can view their own school"
  ON public.schools FOR SELECT
  USING (id = public.my_school_id());

-- ── RLS Policies: staff_profiles ─────────────────────────────────────────────

-- Every user can read their own profile
CREATE POLICY "Staff can read their own profile"
  ON public.staff_profiles FOR SELECT
  USING (id = auth.uid());

-- Headteacher can read ALL staff within their school
CREATE POLICY "Headteacher can view all staff in their school"
  ON public.staff_profiles FOR SELECT
  USING (
    school_id = public.my_school_id()
    AND public.my_role() = 'headteacher'
  );

-- Staff can update only their own profile (cannot change role or school)
CREATE POLICY "Staff can update their own profile"
  ON public.staff_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id        = auth.uid()
    AND role      = (SELECT role      FROM public.staff_profiles WHERE id = auth.uid())
    AND school_id = (SELECT school_id FROM public.staff_profiles WHERE id = auth.uid())
  );

-- INSERT and DELETE → Edge Function only (service_role bypasses RLS)

-- ─── STEP 7: Grant minimum permissions ───────────────────────────────────────
GRANT SELECT            ON public.schools        TO authenticated;
GRANT SELECT, UPDATE    ON public.staff_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_school_id()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_role()       TO authenticated;

COMMIT;

-- ─── STEP 8: Verify ──────────────────────────────────────────────────────────
SELECT
    'Fresh start complete!' AS status,
    (SELECT COUNT(*) FROM auth.users)            AS auth_users,
    (SELECT COUNT(*) FROM public.schools)        AS schools,
    (SELECT COUNT(*) FROM public.staff_profiles) AS staff_profiles;
