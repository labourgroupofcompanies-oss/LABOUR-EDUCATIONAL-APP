-- Fix RLS Policies for get_started_leads
-- This script ensures that developers can view and manage leads from the developer portal.

-- 1. Enable RLS (if not already enabled)
ALTER TABLE public.get_started_leads ENABLE ROW LEVEL SECURITY;

-- 2. Policy: Allow public to submit leads (Marketing site)
-- This is usually already there, but we ensure it exists.
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'get_started_leads' AND policyname = 'Allow public inserts for leads'
    ) THEN
        CREATE POLICY "Allow public inserts for leads" 
        ON public.get_started_leads 
        FOR INSERT 
        TO anon 
        WITH CHECK (true);
    END IF;
END $$;

-- 3. Policy: Only developers can view leads
-- This matches the pattern used for customer_enquiries in the app.
DROP POLICY IF EXISTS "Allow authenticated users to read leads" ON public.get_started_leads;
DROP POLICY IF EXISTS "Only developers can view leads" ON public.get_started_leads;

CREATE POLICY "Only developers can view leads"
    ON public.get_started_leads FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles
            WHERE id = auth.uid() AND role = 'developer'
        )
    );

-- 4. Policy: Only developers can manage leads (Delete)
DROP POLICY IF EXISTS "Only developers can manage leads" ON public.get_started_leads;

CREATE POLICY "Only developers can manage leads"
    ON public.get_started_leads FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles
            WHERE id = auth.uid() AND role = 'developer'
        )
    );
