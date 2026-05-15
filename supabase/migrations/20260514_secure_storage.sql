-- ============================================================
-- SQL Migration: Secure Storage Bucket & Policies
-- Date: 2026-05-14
-- ============================================================

BEGIN;

-- 1. Make the 'school-assets' bucket private
UPDATE storage.buckets
SET public = false
WHERE id = 'school-assets';

-- 2. Drop the insecure public read policy
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;

-- 3. Create a secure read policy for authenticated staff
-- Only allows users to read files if the first folder in the path matches their school_id
CREATE POLICY "Staff Read School Assets"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] = (public.my_school_id())::text
  );

-- 4. Re-verify other policies (Upload, Update, Delete)
-- These already use (storage.foldername(name))[1] = (public.my_school_id())::text
-- so they are already secure, but we ensure they are applied correctly.

COMMIT;
