-- ============================================================
-- LABOUR-APP SYSTEM: Fix school_subscriptions unique constraint
--   + Add Paystack columns if not yet applied
-- Date: 2026-03-28
-- Safe to run on any state of the table.
-- ============================================================

BEGIN;

-- 1. Add Paystack-specific columns IF they don't already exist
--    (covers the case where 20260327_paystack_refactor.sql was never applied)
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS provider        TEXT        NOT NULL DEFAULT 'paystack';
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS amount_paid     NUMERIC;
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS currency        TEXT        DEFAULT 'GHS';
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS verified_at     TIMESTAMPTZ;
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT now();

-- 2. Add soft-delete columns IF they don't already exist
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ NULL;

-- 3. Drop ALL previously created variants of this unique constraint to avoid conflicts
ALTER TABLE public.school_subscriptions DROP CONSTRAINT IF EXISTS uq_school_subscriptions_sync;
ALTER TABLE public.school_subscriptions DROP CONSTRAINT IF EXISTS uq_school_subscriptions_term_year;
ALTER TABLE public.school_subscriptions DROP CONSTRAINT IF EXISTS school_subscriptions_school_id_term_academic_year_key;

-- 4. Re-create with the single canonical name the edge function upsert relies on
ALTER TABLE public.school_subscriptions
    ADD CONSTRAINT uq_school_subscriptions_sync UNIQUE (school_id, term, academic_year);

COMMIT;
