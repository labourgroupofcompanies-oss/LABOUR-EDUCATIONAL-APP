-- ============================================================
--  LABOUR-APP SYSTEM
--  Migration: Create RPC to update school last_sync_at
--  Date: 2026-03-22
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.update_school_sync_time(p_school_id UUID)
RETURNS void AS $$
BEGIN
  -- 🔒 SECURITY CHECK: Ensure the caller actually belongs to this school
  IF EXISTS (
      SELECT 1 FROM public.staff_profiles 
      WHERE id = auth.uid() AND school_id = p_school_id
  ) THEN
      -- ✅ Passed: Allow the timestamp update
      UPDATE public.schools
      SET last_sync_at = NOW()
      WHERE id = p_school_id;
  ELSE
      -- ❌ Failed: Ignore the request and silently fail to prevent probing
      RAISE LOG 'Unauthorized attempt to update sync time for school % by user %', p_school_id, auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_school_sync_time(UUID) TO authenticated;

COMMIT;
