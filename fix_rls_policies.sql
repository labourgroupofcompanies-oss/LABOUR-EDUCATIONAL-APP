-- ── LABOUR-APP RLS POLICY FIX ──
-- Run this script in your Supabase SQL Editor to allow schools to sync their data.

-- Each school should only be able to see and modify their own records.
-- 
-- SECURITY: We read school_id from app_metadata (server-controlled),
-- NOT user_metadata (which any user can modify themselves via updateUser()).
-- Run supabase/migrations/migrate_to_app_metadata.sql first to copy
-- existing users' school_id and role into app_metadata.

-- 1. Create a helper function to get the current user's school_id
-- Reads from app_metadata (written only by server/admin, not the client).
CREATE OR REPLACE FUNCTION public.get_school_id() 
RETURNS TEXT AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'school_id')::TEXT;
$$ LANGUAGE sql STABLE;


-- ─────────────────────────────────────────────────────────────────────────────
-- GENERATE POLICIES FOR ALL SYNCED TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- Table List: schools, users, subjects, classes, students, results, attendance, 
-- settings, assessment_configs, component_scores, fee_structures, fee_payments, 
-- payroll_records, expenses

DO $$ 
DECLARE 
    t text;
    tables text[] := ARRAY[
        'staff_profiles', 'subjects', 'classes', 'class_subjects', 'students', 'results', 'attendance', 
        'settings', 'assessment_configs', 'component_scores', 'fee_structures', 'fee_payments', 
        'payroll_records', 'expenses', 'budgets', 'promotion_requests'
    ];
BEGIN
    FOR t IN SELECT unnest(tables) LOOP
        -- Enable RLS (In case it's not already)
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        
        -- Drop existing policies to avoid conflicts
        EXECUTE format('DROP POLICY IF EXISTS "School isolation policy" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Developers can manage everything" ON public.%I', t);

        -- 1. Main Isolation Policy (Allows users to see/edit their own school data)
        EXECUTE format('
            CREATE POLICY "School isolation policy" ON public.%I
            FOR ALL
            USING (school_id::text = public.get_school_id())
            WITH CHECK (school_id::text = public.get_school_id())
        ', t);

        -- 2. Developer Access Policy (Allows you to see/manage everything in the Dev Portal)
        -- SECURITY: Reads from app_metadata (server-controlled), not user_metadata (user-editable).
        EXECUTE format('
            CREATE POLICY "Developers can manage everything" ON public.%I
            FOR ALL
            USING (auth.jwt() -> ''app_metadata'' ->> ''role'' = ''DEVELOPER'')
            WITH CHECK (auth.jwt() -> ''app_metadata'' ->> ''role'' = ''DEVELOPER'')
        ', t);
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SPECIAL OVERRIDES
-- ─────────────────────────────────────────────────────────────────────────────

-- The 'schools' table itself needs a slight modification for isolation
-- A school record is "theirs" if its school_id matches their school_id
DROP POLICY IF EXISTS "School isolation policy" ON public.schools;
CREATE POLICY "School isolation policy" ON public.schools
FOR ALL USING (id::text = public.get_school_id())
WITH CHECK (id::text = public.get_school_id());

-- Let new schools register from the app (If they are not yet authenticated)
-- Actually, registration usually happens through your manual Developer creation for now,
-- but if they are logging in for the first time, they need to see their school record.

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION COMMANDS
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT * FROM pg_policies WHERE schemaname = 'public';
