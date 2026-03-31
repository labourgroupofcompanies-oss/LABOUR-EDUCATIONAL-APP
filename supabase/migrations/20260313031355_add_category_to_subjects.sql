-- Add category to subjects
ALTER TABLE public.subjects
ADD COLUMN IF NOT EXISTS category text DEFAULT 'General';
