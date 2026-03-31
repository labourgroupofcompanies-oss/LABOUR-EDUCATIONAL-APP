-- Add is_active column to schools for administrative control
ALTER TABLE public.schools 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.schools.is_active IS 'Administrative toggle to enable/disable school access.';
