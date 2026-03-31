-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  FULL SYSTEM WIPE — Deletes ALL data & ALL users                   ║
-- ║  Run in Supabase Dashboard → SQL Editor                            ║
-- ║  ⚠️  THIS IS IRREVERSIBLE. There is no undo.                       ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ─── STEP 1: Wipe all application table data ─────────────────────────────────
-- Disable RLS temporarily so we can delete everything without policy conflicts
ALTER TABLE public.component_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.results           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.students          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools           DISABLE ROW LEVEL SECURITY;

-- Truncate all tables (CASCADE handles foreign key order)
TRUNCATE TABLE
    public.component_scores,
    public.results,
    public.attendance,
    public.assessment_configs,
    public.fee_payments,
    public.fee_structures,
    public.payroll_records,
    public.expenses,
    public.settings,
    public.students,
    public.classes,
    public.subjects,
    public.users,
    public.schools
CASCADE;

-- Wipe subscriptions table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'school_subscriptions') THEN
        ALTER TABLE public.school_subscriptions DISABLE ROW LEVEL SECURITY;
        TRUNCATE TABLE public.school_subscriptions CASCADE;
        ALTER TABLE public.school_subscriptions ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- ─── STEP 2: Delete ALL auth users ───────────────────────────────────────────
DELETE FROM auth.users;

-- ─── STEP 3: Re-enable RLS on all tables ─────────────────────────────────────
ALTER TABLE public.component_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools           ENABLE ROW LEVEL SECURITY;

-- ─── STEP 4: Confirm ─────────────────────────────────────────────────────────
SELECT 
    'System wiped clean. All data and users deleted.' AS status,
    (SELECT COUNT(*) FROM auth.users) AS remaining_auth_users,
    (SELECT COUNT(*) FROM public.schools) AS remaining_schools;
