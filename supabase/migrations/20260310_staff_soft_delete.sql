-- ============================================================
-- LABOUR-APP SYSTEM: ADD soft delete to staff_profiles
-- Date: 2026-03-10
-- ============================================================

ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Update RLS policies to exclude deleted staff from general view
-- (Optional: adjust existing policies to filter is_deleted = false)

DROP POLICY IF EXISTS "Headteacher can view all staff in their school" ON public.staff_profiles;
CREATE POLICY "Headteacher can view all staff in their school"
ON public.staff_profiles
FOR SELECT
USING (
  school_id = public.my_school_id()
  AND public.my_role() = 'headteacher'
  AND is_deleted = false
);

-- Note: "Staff can read their own profile" doesn't strictly need is_deleted = false
-- since if they are deleted they shouldn't be able to log in anyway, 
-- but it's safer to keep it.
