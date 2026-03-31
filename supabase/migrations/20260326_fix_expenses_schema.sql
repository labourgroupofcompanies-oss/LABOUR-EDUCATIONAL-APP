-- SQL Migration: Fix Expenses Schema (Final & Robust)
-- Run this in Supabase Dashboard -> SQL Editor

BEGIN;

-- 1. Ensure the table is correctly defined from the start if it exists partially
-- Note: If you want a truly clean start for this table, you could DROP it first:
-- DROP TABLE IF EXISTS public.expenses CASCADE;

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- 2. Add columns with correct types
-- Using a DO block to handle complex column migrations safely
DO $$
BEGIN
    -- Base required columns
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE;
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS id_local INTEGER;
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS amount NUMERIC(15, 2) NOT NULL DEFAULT 0;
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_note TEXT;
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES public.staff_profiles(id) ON DELETE SET NULL;
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS voided BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS void_reason TEXT;
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    -- Handle date/voided_at migration (if they were BIGINT and failed)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'expenses' AND column_name = 'date' AND data_type = 'bigint'
    ) THEN
        ALTER TABLE public.expenses ALTER COLUMN date SET DATA TYPE TIMESTAMPTZ USING to_timestamp(date / 1000.0);
    ELSE
        ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS date TIMESTAMPTZ;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'expenses' AND column_name = 'voided_at' AND data_type = 'bigint'
    ) THEN
        ALTER TABLE public.expenses ALTER COLUMN voided_at SET DATA TYPE TIMESTAMPTZ USING to_timestamp(voided_at / 1000.0);
    ELSE
        ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
    END IF;

    -- Ensure NOT NULL constraints for core fields
    ALTER TABLE public.expenses ALTER COLUMN category SET NOT NULL;
    ALTER TABLE public.expenses ALTER COLUMN description SET NOT NULL;
    ALTER TABLE public.expenses ALTER COLUMN date SET NOT NULL;
END $$;

-- 3. Add composite unique constraint for sync
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_school_id_id_local_key;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_school_id_id_local_key UNIQUE (school_id, id_local);

-- 4. Enable RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- 5. Set up Policies
DROP POLICY IF EXISTS "Accountants manage expenses" ON public.expenses;
CREATE POLICY "Accountants manage expenses"
  ON public.expenses FOR ALL
  USING (
    school_id = public.my_school_id() 
    AND (public.my_role() IN ('accountant', 'ACCOUNTANT', 'headteacher', 'HEADTEACHER'))
  )
  WITH CHECK (
    school_id = public.my_school_id()
    AND (public.my_role() IN ('accountant', 'ACCOUNTANT', 'headteacher', 'HEADTEACHER'))
  );

-- 6. Grant Permissions
GRANT ALL ON public.expenses TO authenticated;

COMMIT;

-- Verify
SELECT 'expenses table repaired' as status, (SELECT count(*) from public.expenses) as total_records;
