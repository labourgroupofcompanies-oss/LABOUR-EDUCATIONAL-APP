-- ============================================================
-- SQL Migration: Restore school_code column name
-- Date: 2026-03-10
-- ============================================================

BEGIN;

-- 1. Rename school_id back to school_code if it was renamed
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'schools' AND column_name = 'school_id'
    ) AND NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'schools' AND column_name = 'school_code'
    ) THEN
        ALTER TABLE public.schools RENAME COLUMN school_id TO school_code;
    END IF;
END $$;

-- 2. Update comments
COMMENT ON COLUMN public.schools.school_code IS 'Public-facing School ID used on login screens (e.g. SCH-2026-XXXX).';

COMMIT;
