-- SQL Cleanup Script: Trim whitespace and fix inconsistencies
-- Run this in your Supabase SQL Editor to fix any existing bad data

-- 1. Trim whitespace from subscription records
UPDATE public.school_subscriptions
SET 
  term = TRIM(term),
  academic_year = TRIM(academic_year);

-- 2. Trim whitespace from school records
UPDATE public.schools
SET 
  onboarding_term = TRIM(onboarding_term),
  onboarding_academic_year = TRIM(onboarding_academic_year);

-- 3. Standardize status to 'active' for any 'success' payments (if any)
UPDATE public.school_subscriptions
SET status = 'active'
WHERE status = 'success';

-- 4. Verify results (Optional)
SELECT id, school_id, term, academic_year, status 
FROM public.school_subscriptions 
ORDER BY created_at DESC 
LIMIT 10;
