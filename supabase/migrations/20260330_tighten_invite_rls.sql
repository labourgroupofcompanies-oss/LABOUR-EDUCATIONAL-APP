-- ============================================================
--  LABOUR-APP SYSTEM
--  Migration: Tighten invite RLS for revoked links
--  Date: 2026-03-30
--  Purpose: Revoked invites should not be publicly readable.
--           A revoked invite has revoked_at IS NOT NULL.
-- ============================================================

BEGIN;

-- Drop old permissive public read policy
DROP POLICY IF EXISTS "Public can validate unused invites" ON public.school_invites;

-- Recreate: public can only read invites that are both unused AND not revoked
CREATE POLICY "Public can validate unused invites"
  ON public.school_invites
  FOR SELECT
  USING (
    is_used = false AND revoked_at IS NULL
  );

-- Drop old public update policy and recreate to also block revoked invites
DROP POLICY IF EXISTS "Public can mark invite as used" ON public.school_invites;

CREATE POLICY "Public can mark invite as used"
  ON public.school_invites
  FOR UPDATE
  USING (is_used = false AND revoked_at IS NULL)
  WITH CHECK (is_used = true);

COMMIT;
