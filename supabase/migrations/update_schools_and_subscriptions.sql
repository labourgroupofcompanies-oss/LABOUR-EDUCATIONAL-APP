-- Add onboarding info to schools table
ALTER TABLE public.schools 
ADD COLUMN IF NOT EXISTS onboarding_term TEXT,
ADD COLUMN IF NOT EXISTS onboarding_academic_year TEXT;

-- Update RLS policies for school_subscriptions to allow HEADTEACHER, ACCOUNTANT, and DEVELOPER
-- First, drop existing policies if any (based on previous research)
DROP POLICY IF EXISTS "Schools can view their own subscriptions" ON public.school_subscriptions;
DROP POLICY IF EXISTS "Authenticated users can insert subscriptions" ON public.school_subscriptions;

-- Policy for viewing subscriptions
CREATE POLICY "Users can view their school's subscriptions" 
ON public.school_subscriptions 
FOR SELECT 
USING (
  auth.uid() IN (
    SELECT id FROM users 
    WHERE school_id = school_subscriptions.school_id 
    AND role IN ('HEADTEACHER', 'ACCOUNTANT', 'DEVELOPER')
  )
);

-- Policy for inserting subscriptions (after payment)
CREATE POLICY "Authorized users can insert subscriptions" 
ON public.school_subscriptions 
FOR INSERT 
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM users 
    WHERE school_id = school_subscriptions.school_id 
    AND role IN ('HEADTEACHER', 'ACCOUNTANT', 'DEVELOPER')
  )
);
