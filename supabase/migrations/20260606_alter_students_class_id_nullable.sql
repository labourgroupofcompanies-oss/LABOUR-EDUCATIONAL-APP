-- Migration: Make class_id nullable on students table
-- Description: Drop the NOT NULL constraint and update the foreign key action to ON DELETE SET NULL to prevent sync issues.

-- 1. Drop existing foreign key constraint if it exists (automatically named by PostgreSQL)
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_class_id_fkey;

-- 2. Make class_id column nullable
ALTER TABLE public.students ALTER COLUMN class_id DROP NOT NULL;

-- 3. Re-add foreign key constraint with ON DELETE SET NULL
ALTER TABLE public.students 
ADD CONSTRAINT students_class_id_fkey 
FOREIGN KEY (class_id) REFERENCES public.classes(id) 
ON DELETE SET NULL;
