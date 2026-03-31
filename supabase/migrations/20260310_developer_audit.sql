-- ============================================================
-- LABOUR-APP SYSTEM: Developer Audit Trail
-- Date: 2026-03-10
-- ============================================================

CREATE TABLE IF NOT EXISTS public.developer_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    target_id TEXT, -- e.g. school_id or user_id
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Only Service Role can insert.
-- Developers can view all.
ALTER TABLE public.developer_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can view all audit logs"
ON public.developer_actions
FOR SELECT
TO authenticated
USING (public.my_role() = 'developer' OR auth.jwt()->>'email' = 'admin@labourapp.com');

-- Grant permissions
GRANT SELECT ON public.developer_actions TO authenticated;
