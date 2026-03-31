-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  FIX: Classes Multi-Tenant Unique Constraint
-- ║  Run this in the Supabase SQL Editor
-- ╚══════════════════════════════════════════════════════════════════════╝

-- 1. Drop the existing index which might be missing the school_id
DROP INDEX IF EXISTS public.unique_active_class_name_level;

-- 2. Recreate the index explicitly including school_id to allow different schools to have the same class name
CREATE UNIQUE INDEX unique_active_class_name_level
ON public.classes (school_id, name, level)
WHERE is_deleted = false;

-- 3. Return success message
SELECT 'Classes unique constraint successfully rebuilt for Multi-Tenancy!' AS result;
