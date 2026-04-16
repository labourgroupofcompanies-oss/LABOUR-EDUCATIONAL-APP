-- ============================================================================
-- SCHOOL EVENTS & CALENDAR SYSTEM
-- ============================================================================
-- Allows Headteachers to manage school-wide events, holidays, and exams.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.school_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    type TEXT NOT NULL CHECK (type IN ('Holiday', 'Exam', 'Event', 'Meeting', 'Sports', 'Other')),
    location TEXT,
    is_public BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup and overlapping date checks
CREATE INDEX IF NOT EXISTS idx_school_events_school_date ON public.school_events(school_id, start_date);

-- ── Enable RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ────────────────────────────────────────────────────────────

-- SELECT: All staff in the same school can see events
DROP POLICY IF EXISTS "Staff can view their school events" ON public.school_events;
CREATE POLICY "Staff can view their school events"
    ON public.school_events FOR SELECT
    USING (
        auth.uid() IN (
            SELECT id FROM public.staff_profiles 
            WHERE school_id = public.school_events.school_id
        )
    );

-- ALL: Only Headteachers and Developers can manage events
DROP POLICY IF EXISTS "Admins can manage school events" ON public.school_events;
CREATE POLICY "Admins can manage school events"
    ON public.school_events FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles
            WHERE id = auth.uid() 
            AND school_id = public.school_events.school_id
            AND role IN ('headteacher', 'developer')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.staff_profiles
            WHERE id = auth.uid() 
            AND school_id = public.school_events.school_id
            AND role IN ('headteacher', 'developer')
        )
    );

-- ── Realtime ────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'school_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.school_events;
    END IF;
END $$;
