-- ============================================================================
-- FREQUENTLY ASKED QUESTIONS (FAQs) SYSTEM
-- ============================================================================
-- Allows developers to manage platform FAQs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0
);

-- Index for fast ordering
CREATE INDEX IF NOT EXISTS idx_faqs_display_order ON public.faqs(display_order ASC);

-- ── Enable RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ────────────────────────────────────────────────────────────

-- SELECT: Publicly readable so everyone can see FAQs
CREATE POLICY "FAQs are publicly readable"
    ON public.faqs FOR SELECT
    USING (true);

-- INSERT/UPDATE/DELETE: Only developers can modify
-- Note: Reusing the role check logic found in other developer policies
CREATE POLICY "Only developers can modify FAQs"
    ON public.faqs FOR ALL
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
