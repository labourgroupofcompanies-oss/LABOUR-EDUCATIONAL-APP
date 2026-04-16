-- ============================================================================
-- CUSTOMER ENQUIRIES SYSTEM
-- ============================================================================
-- Allows potential clients to submit enquiries via the marketing site.
-- Developers can manage and respond to these enquiries.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_enquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    school_name TEXT,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'new' -- 'new', 'replied', 'archived'
);

-- Enable RLS
ALTER TABLE public.customer_enquiries ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ────────────────────────────────────────────────────────────

-- SELECT: Only developers can see enquiries
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'customer_enquiries' AND policyname = 'Only developers can view enquiries'
    ) THEN
        CREATE POLICY "Only developers can view enquiries"
            ON public.customer_enquiries FOR SELECT
            USING (
                EXISTS (
                    SELECT 1 FROM public.staff_profiles
                    WHERE id = auth.uid() AND role = 'developer'
                )
            );
    END IF;
END $$;

-- INSERT: Public can submit enquiries (for marketing site)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'customer_enquiries' AND policyname = 'Public can submit enquiries'
    ) THEN
        CREATE POLICY "Public can submit enquiries"
            ON public.customer_enquiries FOR INSERT
            WITH CHECK (true);
    END IF;
END $$;

-- UPDATE/DELETE: Only developers can manage
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'customer_enquiries' AND policyname = 'Only developers can manage enquiries'
    ) THEN
        CREATE POLICY "Only developers can manage enquiries"
            ON public.customer_enquiries FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM public.staff_profiles
                    WHERE id = auth.uid() AND role = 'developer'
                )
            );
    END IF;
END $$;
