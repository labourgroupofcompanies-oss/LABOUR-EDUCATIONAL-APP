-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  EMERGENCY ROLLBACK — Run this NOW in Supabase SQL Editor           ║
-- ║  This restores access by reverting RLS back to user_metadata        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- Restore get_school_id() to read from user_metadata (original behaviour)
CREATE OR REPLACE FUNCTION public.get_school_id() 
RETURNS TEXT AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'school_id')::TEXT;
$$ LANGUAGE sql STABLE;

-- Rebuild all policies using user_metadata so existing users regain access
DO $$ 
DECLARE 
    t text;
    tables text[] := ARRAY[
        'schools', 'users', 'subjects', 'classes', 'students', 'results', 'attendance', 
        'settings', 'assessment_configs', 'component_scores', 'fee_structures', 'fee_payments', 
        'payroll_records', 'expenses'
    ];
BEGIN
    FOR t IN SELECT unnest(tables) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "School isolation policy" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Developers can manage everything" ON public.%I', t);

        EXECUTE format('
            CREATE POLICY "School isolation policy" ON public.%I
            FOR ALL
            USING (school_id = public.get_school_id())
            WITH CHECK (school_id = public.get_school_id())
        ', t);

        EXECUTE format('
            CREATE POLICY "Developers can manage everything" ON public.%I
            FOR ALL
            USING (auth.jwt() -> ''user_metadata'' ->> ''role'' = ''DEVELOPER'')
            WITH CHECK (auth.jwt() -> ''user_metadata'' ->> ''role'' = ''DEVELOPER'')
        ', t);
    END LOOP;
END $$;

-- Confirm access is restored
SELECT 'RLS rolled back to user_metadata. Users should now have access again.' AS status;
