-- Allow Developers to send notifications to any school
-- This policy allows Global Admins (developers) to insert notifications for any school_id.

DROP POLICY IF EXISTS "Developers can post to any school" ON public.school_notifications;

CREATE POLICY "Developers can post to any school"
    ON public.school_notifications FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.staff_profiles
            WHERE id = auth.uid() AND role = 'developer'
        )
    );

-- Also allow developers to view and delete them if needed
DROP POLICY IF EXISTS "Developers can manage all notifications" ON public.school_notifications;

CREATE POLICY "Developers can manage all notifications"
    ON public.school_notifications FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles
            WHERE id = auth.uid() AND role = 'developer'
        )
    );
