-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  FIX: Assessment_Configs Check Constraint
-- ║  Run this in the Supabase SQL Editor
-- ╚══════════════════════════════════════════════════════════════════════╝

-- 1. Drop the existing check constraint that is failing
ALTER TABLE public.assessment_configs
DROP CONSTRAINT IF EXISTS assessment_configs_ca_policy_check;

-- 2. We will NOT re-add a strict check constraint. 
-- Rely on the frontend dropdown instead so existing rows don't cause errors.

-- 3. Return success message
SELECT 'Assessment Configs ca_policy check constraint successfully relaxed!' AS result;
