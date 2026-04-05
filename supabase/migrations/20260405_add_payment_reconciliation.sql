-- Migration: Add Reconciliation (Voiding) fields to fee_payments
-- Description: Adds is_voided, void_reason, and voided_at columns to fee_payments table.

ALTER TABLE public.fee_payments 
ADD COLUMN IF NOT EXISTS is_voided BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS void_reason TEXT,
ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

-- Update RLS if necessary (usually 'Accountants manage fee_payments' already covers ALL)
-- No changes needed if the existing policy is FOR ALL.
