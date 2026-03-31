-- ============================================================
-- LABOUR-APP SYSTEM: ADD soft delete to remaining tables
-- Date: 2026-03-27
-- ============================================================

BEGIN;

-- 1. Add is_deleted and deleted_at to settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- 2. Add is_deleted and deleted_at to budgets
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- 3. Add is_deleted and deleted_at to school_subscriptions
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.school_subscriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- 4. Add is_deleted and deleted_at to schools
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- 5. Update unique constraints to ignore deleted rows where applicable
-- For settings, we want one unique key per school. 
-- Standard UNIQUE constraint is required for Supabase upsert logic.
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS uq_settings_key;
DROP INDEX IF EXISTS idx_uq_active_settings_key;
ALTER TABLE public.settings ADD CONSTRAINT uq_settings_key UNIQUE (school_id, key);

-- 6. Ensure unique constraints for other synced tables
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS uq_budgets_sync;
ALTER TABLE public.budgets ADD CONSTRAINT uq_budgets_sync UNIQUE (school_id, category, term, year);

ALTER TABLE public.school_subscriptions DROP CONSTRAINT IF EXISTS uq_school_subscriptions_sync;
ALTER TABLE public.school_subscriptions ADD CONSTRAINT uq_school_subscriptions_sync UNIQUE (school_id, term, academic_year);

COMMIT;
