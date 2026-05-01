-- ============================================================
-- Migration: Term-Based Subscription Pricing
-- Date: 2026-05-01
--
-- Adds term-based pricing structure and term_count tracking.
-- 3-phase pricing model:
--   1. term_count = 0 → First Term (FREE)
--   2. term_count 1-2  → Promotional Pricing
--   3. term_count >= 3 → Standard Pricing
-- ============================================================

-- 1. Add standard and promotional plan pricing to subscription_prices
ALTER TABLE public.subscription_prices
ADD COLUMN IF NOT EXISTS promo_plan_1_term   NUMERIC(10,2) NOT NULL DEFAULT 80,
ADD COLUMN IF NOT EXISTS promo_plan_2_terms  NUMERIC(10,2) NOT NULL DEFAULT 160,
ADD COLUMN IF NOT EXISTS promo_plan_annual   NUMERIC(10,2) NOT NULL DEFAULT 200,
ADD COLUMN IF NOT EXISTS standard_plan_1_term  NUMERIC(10,2) NOT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS standard_plan_2_terms NUMERIC(10,2) NOT NULL DEFAULT 200,
ADD COLUMN IF NOT EXISTS standard_plan_annual  NUMERIC(10,2) NOT NULL DEFAULT 250;

-- Deprecate the days-based promo column by simply leaving it (safe to ignore)
-- We do NOT drop it to avoid breaking any live data

-- 2. Add term_count to schools table to track how many terms a school has gone through
ALTER TABLE public.schools
ADD COLUMN IF NOT EXISTS term_count INTEGER NOT NULL DEFAULT 0;

-- 3. Allow developers to update school term_count
-- (developer RLS policies already allow service_role writes; ensure authenticated UPDATE is allowed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'schools' AND policyname = 'Developer can update school term_count'
  ) THEN
    CREATE POLICY "Developer can update school term_count"
      ON public.schools
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 4. Grant update permissions on schools to authenticated (needed for term_count increment)
GRANT UPDATE ON public.schools TO authenticated;

COMMENT ON COLUMN public.schools.term_count IS
  'Tracks how many subscription terms this school has completed. 0 = first (free) term, 1-2 = promo, 3+ = standard.';

COMMENT ON COLUMN public.subscription_prices.promo_plan_1_term IS 'Promotional price for 1-term plan (term 1-2).';
COMMENT ON COLUMN public.subscription_prices.standard_plan_1_term IS 'Standard price for 1-term plan (term 3+).';
