-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  FIX: Assessment_Configs schema matching frontend payload
-- ║  Run this in the Supabase SQL Editor
-- ╚══════════════════════════════════════════════════════════════════════╝

-- 1. Add missing columns expected by syncService
ALTER TABLE public.assessment_configs
ADD COLUMN IF NOT EXISTS results_locked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ca_policy TEXT DEFAULT 'best-n',
ADD COLUMN IF NOT EXISTS best_n_count INTEGER DEFAULT 2;

-- 2. Add the unique constraint required for the upsert operation:
-- upsert(payload, { onConflict: 'school_id,year,term' })
ALTER TABLE public.assessment_configs
DROP CONSTRAINT IF EXISTS assessment_configs_school_id_year_term_key;

ALTER TABLE public.assessment_configs
ADD CONSTRAINT assessment_configs_school_id_year_term_key UNIQUE (school_id, year, term);

-- 3. Return success message
SELECT 'Assessment Configs schema successfully updated with missing columns and unique constraint!' AS result;
