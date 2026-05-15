-- ============================================================
-- SQL Migration: Add display_order to classes table
-- Date: 2026-05-14
-- ============================================================

BEGIN;

-- Add the missing display_order column to the classes table
ALTER TABLE public.classes 
ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

-- Optional: You might also want to add it to subjects if you plan to sort them
-- ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

COMMIT;
