-- ============================================================
-- SQL Migration: Standardize school_code to school_id
-- Date: 2026-03-10
-- ============================================================

BEGIN;

-- 1. Rename the column in the schools table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'schools' AND column_name = 'school_code'
    ) THEN
        ALTER TABLE public.schools RENAME COLUMN school_code TO school_id;
    END IF;
END $$;

-- 2. Update comments
COMMENT ON COLUMN public.schools.school_id IS 'Public-facing School ID used on login screens (e.g. SCH-2026-A1B2).';

COMMIT;
