-- Add is_read column to get_started_leads
ALTER TABLE public.get_started_leads ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

-- Add comment to the new column
COMMENT ON COLUMN public.get_started_leads.is_read IS 'Whether the lead has been viewed by a developer.';

-- Update RLS policies to allow updating the is_read status
-- (Assuming the fix_leads_rls.sql was already run, we just ensure ALL is allowed for developers)
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
