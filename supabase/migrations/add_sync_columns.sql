-- SQL Script to resolve synchronization data inaccuracies and duplication
-- Run this in your Supabase SQL Editor

-- 1. Add id_local to all tables to preserve relational links across devices
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.assessment_configs ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.component_scores ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS id_local INTEGER;

-- 2. Add image columns if they are missing
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS photo TEXT;

-- 3. CLEANUP: Delete duplicates before applying unique constraints
-- This removes duplicate entries that were created due to missing constraints
DELETE FROM public.users a USING public.users b WHERE a.id > b.id AND a.school_id = b.school_id AND a.username = b.username;
DELETE FROM public.students a USING public.students b WHERE a.id > b.id AND a.school_id = b.school_id AND a.name = b.name;
DELETE FROM public.classes a USING public.classes b WHERE a.id > b.id AND a.school_id = b.school_id AND a.name = b.name;

-- 4. Add composite unique constraints for id_local per school
-- This ensures that upsert works correctly without duplicating records
DO $$ 
DECLARE 
    t TEXT;
    tables TEXT[] := ARRAY['schools', 'users', 'students', 'classes', 'subjects', 'results', 'attendance', 'fee_structures', 'fee_payments', 'payroll_records', 'expenses', 'assessment_configs', 'component_scores', 'settings'];
BEGIN 
    FOR t IN SELECT unnest(tables) LOOP
        -- Drop if exists (to be safe)
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I_school_id_id_local_key', t, t);
        
        -- Special case for 'schools' table which uses 'school_id' as its primary pivot
        IF t = 'schools' THEN
            EXECUTE 'ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_id_local_key';
            -- We don't need school_id in the unique for schools because school_id is already the PK
            -- But we still want to ensure one local school ID per school entry
            CONTINUE; 
        END IF;

        -- Apply the unique constraint
        -- Note: This will only work if id_local is NOT NULL. 
        -- If you have existing data where id_local is NULL, you may need to fill it or remove NULLs first.
        -- For now, we apply it and any NEW/SYNCED data will be protected.
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I_school_id_id_local_key UNIQUE (school_id, id_local)', t, t);
    END LOOP;
END $$;
