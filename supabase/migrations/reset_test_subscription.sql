-- SQL Reset Script: Delete subscriptions to allow fresh testing
-- Run this in your Supabase SQL Editor

-- 1. Identify and delete all paid subscription records for this school
DELETE FROM public.school_subscriptions 
WHERE school_id = 'SCH-LOCAL-2026-LGKG';

-- 2. (Optional) Disable the "Free Trial" by moving the onboarding date to the past
-- If you want to test the PAYMENT flow, your current term/year in Settings 
-- MUST NOT match these onboarding values.
UPDATE public.schools
SET 
  onboarding_term = 'Term 0', 
  onboarding_academic_year = '2000/2001'
WHERE school_id = 'SCH-LOCAL-2026-LGKG';

-- 3. Verify they are gone
SELECT id, school_id, term, academic_year, status 
FROM public.school_subscriptions 
WHERE school_id = 'SCH-LOCAL-2026-LGKG';

-- 4. Verify school onboarding shifted
SELECT school_id, school_name, onboarding_term, onboarding_academic_year 
FROM public.schools 
WHERE school_id = 'SCH-LOCAL-2026-LGKG';
