-- accountant_rls.sql
-- Grants the Accountant role appropriate read/write privileges over staff profiles and financial records.

BEGIN;

-- 1. Grant Accountants SELECT access to staff profiles so they can populate the Payroll and Expenses dropdowns
DROP POLICY IF EXISTS "Accountant can view all staff in their school" ON public.staff_profiles;
CREATE POLICY "Accountant can view all staff in their school"
  ON public.staff_profiles FOR SELECT
  USING (
    school_id = public.my_school_id() 
    AND (public.my_role() = 'accountant' OR public.my_role() = 'ACCOUNTANT')
  );

-- 2. Grant Accountants full access to payroll_records
DROP POLICY IF EXISTS "Accountants manage payroll_records" ON public.payroll_records;
CREATE POLICY "Accountants manage payroll_records"
  ON public.payroll_records FOR ALL
  USING (
    school_id = public.my_school_id() 
    AND (public.my_role() = 'accountant' OR public.my_role() = 'ACCOUNTANT')
  )
  WITH CHECK (
    school_id = public.my_school_id()
    AND (public.my_role() = 'accountant' OR public.my_role() = 'ACCOUNTANT')
  );

-- 3. Grant Accountants full access to expenses
DROP POLICY IF EXISTS "Accountants manage expenses" ON public.expenses;
CREATE POLICY "Accountants manage expenses"
  ON public.expenses FOR ALL
  USING (
    school_id = public.my_school_id() 
    AND (public.my_role() = 'accountant' OR public.my_role() = 'ACCOUNTANT')
  )
  WITH CHECK (
    school_id = public.my_school_id()
    AND (public.my_role() = 'accountant' OR public.my_role() = 'ACCOUNTANT')
  );

-- 4. Grant Accountants full access to fee_payments
DROP POLICY IF EXISTS "Accountants manage fee_payments" ON public.fee_payments;
CREATE POLICY "Accountants manage fee_payments"
  ON public.fee_payments FOR ALL
  USING (
    school_id = public.my_school_id() 
    AND (public.my_role() = 'accountant' OR public.my_role() = 'ACCOUNTANT')
  )
  WITH CHECK (
    school_id = public.my_school_id()
    AND (public.my_role() = 'accountant' OR public.my_role() = 'ACCOUNTANT')
  );

-- 5. Grant Accountants full access to budgets
DROP POLICY IF EXISTS "Accountants manage budgets" ON public.budgets;
CREATE POLICY "Accountants manage budgets"
  ON public.budgets FOR ALL
  USING (
    school_id = public.my_school_id() 
    AND (public.my_role() = 'accountant' OR public.my_role() = 'ACCOUNTANT')
  )
  WITH CHECK (
    school_id = public.my_school_id()
    AND (public.my_role() = 'accountant' OR public.my_role() = 'ACCOUNTANT')
  );

COMMIT;
