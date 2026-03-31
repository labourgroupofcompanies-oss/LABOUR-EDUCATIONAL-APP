-- ============================================================
-- SQL Migration: Supabase Storage Setup (school-assets)
-- Date: 2026-03-10
-- ============================================================

-- 1. Create the Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-assets', 'school-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Drop old policies if re-running
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Staff Upload" ON storage.objects;
DROP POLICY IF EXISTS "Staff Update Assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff Delete Assets" ON storage.objects;

-- 4. Public read access for this bucket
CREATE POLICY "Public Read Access"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'school-assets');

-- 5. Allow authenticated staff to upload only into their school's folder
-- Folder structure: school-assets/{school_id}/{file_name}
CREATE POLICY "Authenticated Staff Upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = (public.my_school_id())::text
  );

-- 6. Allow staff to update only their own school's assets
CREATE POLICY "Staff Update Assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = (public.my_school_id())::text
  )
  WITH CHECK (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = (public.my_school_id())::text
  );

-- 7. Allow staff to delete only their own school's assets
CREATE POLICY "Staff Delete Assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] = (public.my_school_id())::text
  );
