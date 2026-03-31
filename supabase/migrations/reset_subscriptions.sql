-- ============================================================
-- Reset Subscription Status for Testing
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Optional: View all current subscriptions
-- SELECT * FROM public.school_subscriptions;

-- 2. Delete all existing subscriptions across all schools
-- This forces every school back to the 'Subscription Required' state
DELETE FROM public.school_subscriptions;

-- Or if you only want to delete subscriptions for a specific status, uncomment and use this instead:
-- DELETE FROM public.school_subscriptions WHERE status = 'active';

-- Or if you only want to change them to 'expired' instead of deleting them:
-- UPDATE public.school_subscriptions SET status = 'expired';
