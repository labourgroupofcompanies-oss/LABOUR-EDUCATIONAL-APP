-- Add collection_code and notified_at to payroll_records

ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS collection_code TEXT;
ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
