-- ============================================================
-- LABOUR-APP SYSTEM: ENSURE soft delete columns on staff_profiles
-- Fixes PGRST204 error: Could not find the 'deleted_at' column
-- ============================================================

ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Re-apply policies to include is_deleted check
DROP POLICY IF EXISTS "Headteacher can view all staff in their school" ON public.staff_profiles;
CREATE POLICY "Headteacher can view all staff in their school"
ON public.staff_profiles
FOR SELECT
USING (
  school_id = public.my_school_id()
  AND public.my_role() = 'headteacher'
  AND is_deleted = false
);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
