-- Migration: Add motto column to schools table
-- Description: Adds a nullable TEXT column for school motto/slogan.
-- Implementation: Run this in the Supabase SQL Editor.

-- 1. Add motto column to schools table
ALTER TABLE public.schools 
ADD COLUMN IF NOT EXISTS motto TEXT;

-- 2. Ensure existing records have NULL as default (which is default behavior for new columns)
COMMENT ON COLUMN public.schools.motto IS 'The official motto or slogan of the school.';
