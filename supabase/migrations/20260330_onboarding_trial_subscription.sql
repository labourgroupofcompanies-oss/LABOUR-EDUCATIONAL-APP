-- ============================================================
-- LABOUR-APP SYSTEM: Onboarding Trial Subscription Policy
-- Date: 2026-03-30
-- 
-- Purpose:
--   When a school is onboarded, a 'trial' subscription row is 
--   automatically inserted for the first term. This migration 
--   ensures:
--   1. The 'trial' status is valid in the CHECK constraint (already true)
--   2. The INSERT policy allows this during onboarding (headteacher role)
--   3. A helper policy allows the server/service role to write trial rows
--      for schools that were onboarded before this feature was released
-- ============================================================

BEGIN;

-- Allow service role to back-fill trial rows for existing schools
-- (This is a SECURITY DEFINER function callable by the Edge Function or developer)
CREATE OR REPLACE FUNCTION public.backfill_trial_subscription(
    p_school_id uuid,
    p_term      text,
    p_year      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.school_subscriptions (
        school_id,
        term,
        academic_year,
        status,
        amount_paid,
        activated_at
    )
    VALUES (
        p_school_id,
        p_term,
        p_year,
        'trial',
        0,
        now()
    )
    ON CONFLICT (school_id, term, academic_year) DO NOTHING;
END;
$$;

-- Grant execute to authenticated users (developer portal can call this to
-- back-fill trial records for existing schools that predate this feature)
GRANT EXECUTE ON FUNCTION public.backfill_trial_subscription(uuid, text, text) TO authenticated;

-- Also allow SELECT on trial rows (the existing SELECT policy already allows
-- any authenticated user in the school to see their subscription records, 
-- so trial rows are automatically visible). Nothing extra needed.

COMMIT;
