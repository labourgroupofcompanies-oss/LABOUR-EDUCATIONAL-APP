-- ── LABOUR-APP SCHEMA ALIGNMENT ──
-- Run this script to add missing columns required for CA Policy and Results synchronization.

-- 1. Assessment Configs: Add missing Max Score columns
ALTER TABLE public.assessment_configs 
ADD COLUMN IF NOT EXISTS test_max_score INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS exercise_max_score INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS assignment_max_score INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS project_max_score INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS exam_max_score INTEGER DEFAULT 100;

-- 2. Results: Add CA breakdown storage
ALTER TABLE public.results
ADD COLUMN IF NOT EXISTS ca_scores JSONB DEFAULT '{}';

-- 3. Cleanup: Ensure all RLS policies are refreshed
-- (This ensures the new columns are immediately accessible)
NOTIFY pgrst, 'reload schema';
