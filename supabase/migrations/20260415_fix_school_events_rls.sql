-- ============================================================================
-- FIX: school_events RLS - Corrected Row Level Security Policy
-- ============================================================================
-- Problem:  The syncService syncs ALL locally-pending school_events under
--           whatever user is currently logged in (teacher, accountant, etc).
--           Events are created by the headteacher but cached locally on ALL
--           devices. When a teacher's session syncs, `created_by` = headteacher
--           UUID but `auth.uid()` = teacher UUID -> 42501.
--
-- Solution: Permit any authenticated staff of the school to INSERT/UPDATE
--           events for their school. Authorization is enforced at the
--           application level - only headteachers can see the Calendar Manager
--           UI and create events. The DB policy just ensures school isolation.
-- ============================================================================

-- Drop all existing policies for a clean slate
DROP POLICY IF EXISTS "Staff can view their school events" ON public.school_events;
DROP POLICY IF EXISTS "Admins can manage school events" ON public.school_events;
DROP POLICY IF EXISTS "Staff can insert events they created" ON public.school_events;
DROP POLICY IF EXISTS "Admins or creators can update school events" ON public.school_events;
DROP POLICY IF EXISTS "Admins or creators can delete school events" ON public.school_events;

-- Also drop the new policies in case the script is run multiple times
DROP POLICY IF EXISTS "Staff can insert school events for their school" ON public.school_events;
DROP POLICY IF EXISTS "Staff can update school events for their school" ON public.school_events;
DROP POLICY IF EXISTS "Admins can delete school events" ON public.school_events;

-- SELECT: All staff in the school can read events
CREATE POLICY "Staff can view their school events"
    ON public.school_events FOR SELECT
    USING (
        school_id IN (
            SELECT school_id FROM public.staff_profiles
            WHERE id = auth.uid()
        )
    );

-- INSERT: Any school staff can sync-push events for their school
-- Note: The CalendarManager UI is only visible to headteachers.
-- This policy only enforces school isolation.
CREATE POLICY "Staff can insert school events for their school"
    ON public.school_events FOR INSERT
    WITH CHECK (
        school_id IN (
            SELECT school_id FROM public.staff_profiles
            WHERE id = auth.uid()
        )
    );

-- UPDATE: Any school staff can sync-push updates for their school
CREATE POLICY "Staff can update school events for their school"
    ON public.school_events FOR UPDATE
    USING (
        school_id IN (
            SELECT school_id FROM public.staff_profiles
            WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        school_id IN (
            SELECT school_id FROM public.staff_profiles
            WHERE id = auth.uid()
        )
    );

-- DELETE: Only headteachers and developers can hard-delete events
CREATE POLICY "Admins can delete school events"
    ON public.school_events FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles
            WHERE id = auth.uid()
            AND school_id = public.school_events.school_id
            AND role IN ('headteacher', 'developer')
        )
    );
