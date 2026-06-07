-- Migration: Make guardian details nullable on students table
-- Description: Drop the NOT NULL constraints on guardian_name and guardian_primary_contact to support optional fields.

-- Make guardian_name and guardian_primary_contact columns nullable
ALTER TABLE public.students ALTER COLUMN guardian_name DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN guardian_primary_contact DROP NOT NULL;
