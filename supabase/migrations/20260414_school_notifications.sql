-- ============================================================================
-- SCHOOL NOTIFICATIONS SYSTEM
-- ============================================================================
-- Multi-school safe: all queries are scoped to school_id via RLS.
-- Headteachers post notifications → all staff in the SAME school see them.
-- ============================================================================

-- ── 1. Notifications table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
    posted_by UUID NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast per-school lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_school_notifications_school_id
    ON public.school_notifications(school_id, created_at DESC);

-- ── 2. Read-tracking table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.school_notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One read record per user per notification
    UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user
    ON public.notification_reads(user_id, notification_id);

-- ── 3. Enable RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.school_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

-- ── 4. RLS Policies for school_notifications ────────────────────────────────

-- SELECT: Staff can only read notifications belonging to their own school
CREATE POLICY "Staff can read own school notifications"
    ON public.school_notifications FOR SELECT
    USING (
        school_id IN (
            SELECT sp.school_id FROM public.staff_profiles sp WHERE sp.id = auth.uid()
        )
    );

-- INSERT: Only headteachers can post notifications
CREATE POLICY "Headteachers can post notifications"
    ON public.school_notifications FOR INSERT
    WITH CHECK (
        posted_by = auth.uid()
        AND school_id IN (
            SELECT sp.school_id FROM public.staff_profiles sp
            WHERE sp.id = auth.uid() AND sp.role = 'headteacher'
        )
    );

-- DELETE: Headteachers can delete their own school's notifications
CREATE POLICY "Headteachers can delete own school notifications"
    ON public.school_notifications FOR DELETE
    USING (
        school_id IN (
            SELECT sp.school_id FROM public.staff_profiles sp
            WHERE sp.id = auth.uid() AND sp.role = 'headteacher'
        )
    );

-- ── 5. RLS Policies for notification_reads ──────────────────────────────────

-- SELECT: Users can only see their own read records
CREATE POLICY "Users can read own read records"
    ON public.notification_reads FOR SELECT
    USING (user_id = auth.uid());

-- INSERT: Users can mark notifications as read (only for themselves)
CREATE POLICY "Users can mark notifications as read"
    ON public.notification_reads FOR INSERT
    WITH CHECK (user_id = auth.uid());
