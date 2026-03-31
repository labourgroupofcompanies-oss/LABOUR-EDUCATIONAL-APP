-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  RLS FIX FOR assessment_configs
-- ║  Run this in the Supabase SQL Editor to grant access
-- ╚══════════════════════════════════════════════════════════════════════╝

-- 1. Ensure RLS is enabled
ALTER TABLE public.assessment_configs ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "School isolation policy" ON public.assessment_configs;
DROP POLICY IF EXISTS "Developers can manage everything" ON public.assessment_configs;

-- 3. Create normal School Isolation Policy
CREATE POLICY "School isolation policy" ON public.assessment_configs
    FOR ALL
    USING (school_id = public.my_school_id())
    WITH CHECK (school_id = public.my_school_id());

-- 4. Create Developer Policy
CREATE POLICY "Developers can manage everything" ON public.assessment_configs
    FOR ALL
    USING (public.my_role() = 'DEVELOPER')
    WITH CHECK (public.my_role() = 'DEVELOPER');

-- 5. Return success
SELECT 'RLS policies for assessment_configs have been successfully repaired!' AS result;
