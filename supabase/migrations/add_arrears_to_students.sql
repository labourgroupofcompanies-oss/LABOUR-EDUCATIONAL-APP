-- Migration: Add 'arrears' to students table
-- Description: Adds a numeric field to track brought-forward historical debt/fee arrears for a student.

ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS arrears NUMERIC DEFAULT 0;
