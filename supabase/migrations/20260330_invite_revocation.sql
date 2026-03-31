-- ============================================================
--  LABOUR-APP SYSTEM
--  Migration: Invite Revocation Tracking
--  Date: 2026-03-30
--  Purpose: Separate "used by school" from "revoked by developer"
--           by adding explicit revocation columns.
-- ============================================================

BEGIN;

-- Add revocation columns (safe to run on existing tables)
ALTER TABLE public.school_invites
  ADD COLUMN IF NOT EXISTS revoked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by  UUID REFERENCES auth.users(id);

-- Backfill: any row where notes = 'Cancelled by Developer' (old pattern)
-- is treated as developer-revoked, not school-used.
UPDATE public.school_invites
SET
  revoked_at  = COALESCE(used_at, NOW()),
  revoked_by  = created_by,   -- best approximation; developer cancelled it
  used_at     = NULL,
  is_used     = false          -- clear the is_used flag so status logic is clean
WHERE notes = 'Cancelled by Developer';

-- Developer policy already covers ALL operations on this table.
-- No additional policy changes are needed.

COMMIT;
