-- Add missing columns to schools table if they don't exist
ALTER TABLE public.schools 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS onboarding_term TEXT,
ADD COLUMN IF NOT EXISTS onboarding_academic_year TEXT,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
