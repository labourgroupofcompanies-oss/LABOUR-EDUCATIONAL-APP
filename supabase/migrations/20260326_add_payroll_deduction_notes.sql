-- Add deduction_notes column to payroll_records
ALTER TABLE public.payroll_records 
ADD COLUMN IF NOT EXISTS deduction_notes TEXT;

-- Verify or update conflict constraints if necessary (usually ID or unique indexes)
-- The sync service uses: onConflict: 'school_id,staff_id,month,year'
-- Let's ensure a unique constraint exists for these fields to support upsert.
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payroll_records_unique_period'
    ) THEN
        ALTER TABLE public.payroll_records 
        ADD CONSTRAINT payroll_records_unique_period UNIQUE (school_id, staff_id, month, year);
    END IF;
END $$;
