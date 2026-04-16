-- ============================================================================
-- USER STORIES (RATINGS) MANAGEMENT POLICIES
-- ============================================================================
-- Allows developers to manage user testimonials/ratings.
-- ============================================================================

-- Ensure RLS is enabled on user_stories
ALTER TABLE public.user_stories ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ────────────────────────────────────────────────────────────

-- SELECT: Publicly readable (standard for testimonials)
-- If a policy already exists, this might need adjustment, but usually "SELECT true" is safe.
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_stories' AND policyname = 'User stories are publicly readable'
    ) THEN
        CREATE POLICY "User stories are publicly readable"
            ON public.user_stories FOR SELECT
            USING (true);
    END IF;
END $$;

-- DELETE: Only developers can delete stories
CREATE POLICY "Only developers can delete user stories"
    ON public.user_stories FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles
            WHERE id = auth.uid() AND role = 'developer'
        )
    );

-- UPDATE: Only developers can edit stories (for cleanup)
CREATE POLICY "Only developers can update user stories"
    ON public.user_stories FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_profiles
            WHERE id = auth.uid() AND role = 'developer'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.staff_profiles
            WHERE id = auth.uid() AND role = 'developer'
        )
    );

-- INSERT: Any authenticated staff member can submit their story/rating
CREATE POLICY "Authenticated staff can submit stories"
    ON public.user_stories FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

