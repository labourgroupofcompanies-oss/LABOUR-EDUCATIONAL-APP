-- Migration: Add 'class_id' to students table
-- Description: Adds the class_id column to link students to their respective classes.

ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;

-- Create an index for faster lookups when filtering students by class
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
