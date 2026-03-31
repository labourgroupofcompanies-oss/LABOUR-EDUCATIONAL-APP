-- ── LABOUR-APP AUTH METADATA SYNC TRIGGER ──
-- This migration ensures that security-critical fields like school_id and role
-- are always kept in app_metadata, which is the source of truth for RLS.
-- Even when users sign up via the client (where they can only set user_metadata),
-- this trigger will move the values to the authoritative app_metadata.

CREATE OR REPLACE FUNCTION public.sync_user_metadata_to_app_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Copy school_id and role from user_metadata -> app_metadata if they exist
  -- result || object merges the new fields into existing app_metadata
  NEW.raw_app_meta_data = COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) || 
    jsonb_strip_nulls(jsonb_build_object(
      'school_id', NEW.raw_user_meta_data->>'school_id',
      'role',      NEW.raw_user_meta_data->>'role'
    ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to every user creation or update
DROP TRIGGER IF EXISTS on_auth_user_sync_metadata ON auth.users;
CREATE TRIGGER on_auth_user_sync_metadata
  BEFORE INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_metadata_to_app_metadata();


-- ─────────────────────────────────────────────────────────────────────────────
-- REPAIR SCRIPT: Sync existing users who are currently blocked
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_strip_nulls(jsonb_build_object(
      'school_id', raw_user_meta_data->>'school_id',
      'role',      raw_user_meta_data->>'role'
    ))
WHERE 
    raw_user_meta_data->>'school_id' IS NOT NULL 
    OR raw_user_meta_data->>'role' IS NOT NULL;
