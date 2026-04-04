-- Add collection_code and notified_at to payroll_records

ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS collection_code TEXT;
ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- Drop the old constraint that only allowed 'Paid' or 'Pending'
ALTER TABLE public.payroll_records DROP CONSTRAINT IF EXISTS payroll_records_status_check;

-- Add the new constraint that allows 'Ready'
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_status_check CHECK (status IN ('Pending', 'Ready', 'Paid'));
