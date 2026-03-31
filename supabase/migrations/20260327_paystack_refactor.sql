-- ============================================================
-- LABOUR-APP SYSTEM: Paystack Subscription Refactor
-- Date: 2026-03-27
-- ============================================================

BEGIN;

-- 1. Add Paystack-specific verification fields to school_subscriptions
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'paystack';
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS amount_paid NUMERIC;
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'GHS';
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 2. Clean up status to ensure it matches expected values
-- Existing rows might have different status strings, we'll map them if needed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'school_subscriptions' AND column_name = 'status') THEN
        UPDATE public.school_subscriptions SET status = 'active' WHERE status ILIKE 'active' OR status ILIKE 'paid' OR status ILIKE 'trial';
    END IF;
END $$;

-- 3. Ensure unique constraint for deterministic access checks
-- (school_id, term, academic_year) -> Only one subscription record per term
ALTER TABLE public.school_subscriptions DROP CONSTRAINT IF EXISTS uq_school_subscriptions_sync;
ALTER TABLE public.school_subscriptions DROP CONSTRAINT IF EXISTS school_subscriptions_school_id_term_academic_year_key;

ALTER TABLE public.school_subscriptions ADD CONSTRAINT uq_school_subscriptions_term_year UNIQUE (school_id, term, academic_year);

-- 4. Ensure onboarding fields exist in schools
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS onboarding_term TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS onboarding_academic_year TEXT;

COMMIT;
