-- migration: 20260325_payroll_identity_refactor.sql
-- Refactor payroll_records to use stable staff_id (UUID) for ownership.

BEGIN;

-- 1. Ensure sync infrastructure columns exist
ALTER TABLE public.payroll_records 
ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff_profiles(id) DEFAULT NULL;

ALTER TABLE public.payroll_records 
ADD COLUMN IF NOT EXISTS id_local INTEGER;

-- 1.5 Ensure technical sync constraint exists
ALTER TABLE public.payroll_records
DROP CONSTRAINT IF EXISTS payroll_records_school_id_id_local_key;

ALTER TABLE public.payroll_records
ADD CONSTRAINT payroll_records_school_id_id_local_key 
UNIQUE (school_id, id_local);

-- 2. Create the new unique constraint for the final identity model
-- This constraint ensures one payroll per school/staff/month/year.
-- We keep the legacy staff_id_local constraint active for compatibility with un-backfilled rows.
ALTER TABLE public.payroll_records
DROP CONSTRAINT IF EXISTS payroll_records_school_id_staff_id_month_year_key;

ALTER TABLE public.payroll_records
ADD CONSTRAINT payroll_records_school_id_staff_id_month_year_key 
UNIQUE (school_id, staff_id, month, year);

-- 3. Update RLS policies to allow Teachers/Staff to view ONLY their own records
-- This provides strict privacy for teacher payslips.

DROP POLICY IF EXISTS "Staff can view their own payroll records" ON public.payroll_records;
CREATE POLICY "Staff can view their own payroll records"
  ON public.payroll_records FOR SELECT
  USING (
    staff_id = auth.uid()
  );

-- 4. Ensure Headteachers can still see all school payroll records
DROP POLICY IF EXISTS "Headteachers can view school payroll" ON public.payroll_records;
CREATE POLICY "Headteachers can view school payroll"
  ON public.payroll_records FOR SELECT
  USING (
    school_id = public.my_school_id() 
    AND (public.my_role() = 'headteacher' OR public.my_role() = 'HEADTEACHER')
  );

-- 5. Accountants already have "Accountants manage payroll_records" from 20260321_accountant_rls.sql
-- No change needed there, but we ensure it remains valid for the new column.

COMMIT;
