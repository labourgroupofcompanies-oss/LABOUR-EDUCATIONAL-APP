-- Add missing deduction_notes column to payroll_records
ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS deduction_notes TEXT;
