-- ============================================================
--  LABOUR-APP SYSTEM
--  Migration: Secure School Onboarding (Option B)
--  Date: 2026-03-22
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.school_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ,
  notes TEXT
);

-- RLS
ALTER TABLE public.school_invites ENABLE ROW LEVEL SECURITY;

-- 1. Developers can manage ALL invites (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Developers can manage invites" 
  ON public.school_invites
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid() AND role = 'developer')
  );

-- 2. Public clients can read unused invites to validate them before submitting the form.
CREATE POLICY "Public can validate unused invites"
  ON public.school_invites
  FOR SELECT
  USING (
    is_used = false
  );

-- 3. Public clients can mark an invite as used when they successfully register.
-- This policy allows updating an unused invite, as long as the update sets is_used = true.
CREATE POLICY "Public can mark invite as used"
  ON public.school_invites
  FOR UPDATE
  USING (is_used = false)
  WITH CHECK (is_used = true);

COMMIT;
