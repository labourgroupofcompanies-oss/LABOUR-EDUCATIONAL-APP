-- 20260328_fix_financial_rls.sql
-- Description: Grants Teachers and Headteachers SELECT access to fee_payments and fee_structures.
-- Note: Payroll RLS is already managed in 20260325_payroll_identity_refactor.sql

BEGIN;

-- 1. Grant SELECT access to fee_payments for all staff in the same school
-- This is necessary for Teachers/Headteachers to calculate student fee balances.
DROP POLICY IF EXISTS "Staff can view fee_payments in their school" ON public.fee_payments;
CREATE POLICY "Staff can view fee_payments in their school"
  ON public.fee_payments FOR SELECT
  USING (
    school_id = public.my_school_id()
  );

-- 2. Grant SELECT access to fee_structures for all staff in the same school
DROP POLICY IF EXISTS "Staff can view fee_structures in their school" ON public.fee_structures;
CREATE POLICY "Staff can view fee_structures in their school"
  ON public.fee_structures FOR SELECT
  USING (
    school_id = public.my_school_id()
  );

COMMIT;
