-- ============================================================
-- SQL Migration: Add Developer Permissions for School Management
-- Date: 2026-03-23
-- ============================================================

BEGIN;

-- 1. Create developer audit trail table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.developer_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    target_id TEXT, -- e.g. school_id or user_id
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.developer_actions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.developer_actions TO authenticated;

-- 2. Allow Developers to UPDATE public.schools (for toggling is_active)
DROP POLICY IF EXISTS "Developers can update schools" ON public.schools;
CREATE POLICY "Developers can update schools"
  ON public.schools
  FOR UPDATE
  USING (
    public.my_role() = 'developer' OR auth.jwt()->>'email' = 'admin@labourapp.com'
  )
  WITH CHECK (
    public.my_role() = 'developer' OR auth.jwt()->>'email' = 'admin@labourapp.com'
  );

-- 3. Allow Developers to INSERT into developer_actions
DROP POLICY IF EXISTS "Developers can insert audit logs" ON public.developer_actions;
CREATE POLICY "Developers can insert audit logs"
  ON public.developer_actions
  FOR INSERT
  WITH CHECK (
    public.my_role() = 'developer' OR auth.jwt()->>'email' = 'admin@labourapp.com'
  );

COMMIT;
