-- ============================================================
-- SQL Migration: REPAIR SUBJECTS & CLASS PERMISSIONS (v2)
-- Date: 2026-03-12
--
-- This script fixes "403 Forbidden" sync errors by:
-- 1. Standardizing role checks (using both 'headteacher' and 'HEADTEACHER')
-- 2. Providing standard SELECT/INSERT/UPDATE permissions to authenticated role
-- 3. Making policies idempotent (runnable multiple times)
-- ============================================================

-- ── 1. GRANT TABLE PERMISSIONS ───────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_subjects TO authenticated;

-- ── 2. REPAIR SUBJECTS POLICIES ──────────────────────────────
DROP POLICY IF EXISTS "Enable read access for all users within the same school" ON public.subjects;
CREATE POLICY "Enable read access for all users within the same school"
ON public.subjects FOR SELECT
TO authenticated
USING (
    school_id = (SELECT school_id FROM public.staff_profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Enable insert access for headteachers/admins in same school" ON public.subjects;
DROP POLICY IF EXISTS "Onboarding: Allow subject registration" ON public.subjects;
DROP POLICY IF EXISTS "Subjects: Allow headteacher sync" ON public.subjects;
CREATE POLICY "Subjects: Allow headteacher sync"
ON public.subjects FOR INSERT
TO authenticated
WITH CHECK (
    school_id = (SELECT school_id FROM public.staff_profiles WHERE id = auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE id = auth.uid() 
        AND (LOWER(role) = 'headteacher' OR LOWER(role) = 'admin')
    )
);

DROP POLICY IF EXISTS "Enable update access for headteachers/admins in same school" ON public.subjects;
DROP POLICY IF EXISTS "Subjects: Allow headteacher update" ON public.subjects;
CREATE POLICY "Subjects: Allow headteacher update"
ON public.subjects FOR UPDATE
TO authenticated
USING (
    school_id = (SELECT school_id FROM public.staff_profiles WHERE id = auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE id = auth.uid() 
        AND (LOWER(role) = 'headteacher' OR LOWER(role) = 'admin')
    )
);

-- ── 3. REPAIR CLASSES POLICIES ───────────────────────────────
DROP POLICY IF EXISTS "Enable read access for all users within the same school" ON public.classes;
CREATE POLICY "Enable read access for all users within the same school"
ON public.classes FOR SELECT
TO authenticated
USING (
    school_id = (SELECT school_id FROM public.staff_profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Enable insert access for headteachers/admins in same school" ON public.classes;
DROP POLICY IF EXISTS "Classes: Allow headteacher sync" ON public.classes;
CREATE POLICY "Classes: Allow headteacher sync"
ON public.classes FOR INSERT
TO authenticated
WITH CHECK (
    school_id = (SELECT school_id FROM public.staff_profiles WHERE id = auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE id = auth.uid() 
        AND (LOWER(role) = 'headteacher' OR LOWER(role) = 'admin')
    )
);

DROP POLICY IF EXISTS "Enable update access for headteachers/admins in same school" ON public.classes;
DROP POLICY IF EXISTS "Classes: Allow headteacher update" ON public.classes;
CREATE POLICY "Classes: Allow headteacher update"
ON public.classes FOR UPDATE
TO authenticated
USING (
    school_id = (SELECT school_id FROM public.staff_profiles WHERE id = auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE id = auth.uid() 
        AND (LOWER(role) = 'headteacher' OR LOWER(role) = 'admin')
    )
);

-- ── 4. REPAIR CLASS_SUBJECTS POLICIES ────────────────────────
DROP POLICY IF EXISTS "Enable read access for all users within the same school" ON public.class_subjects;
CREATE POLICY "Enable read access for all users within the same school"
ON public.class_subjects FOR SELECT
TO authenticated
USING (
    school_id = (SELECT school_id FROM public.staff_profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Enable insert access for headteachers/admins in same school" ON public.class_subjects;
DROP POLICY IF EXISTS "ClassSubjects: Allow headteacher sync" ON public.class_subjects;
CREATE POLICY "ClassSubjects: Allow headteacher sync"
ON public.class_subjects FOR INSERT
TO authenticated
WITH CHECK (
    school_id = (SELECT school_id FROM public.staff_profiles WHERE id = auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE id = auth.uid() 
        AND (LOWER(role) = 'headteacher' OR LOWER(role) = 'admin')
    )
);

DROP POLICY IF EXISTS "Enable update access for headteachers/admins in same school" ON public.class_subjects;
DROP POLICY IF EXISTS "ClassSubjects: Allow headteacher update" ON public.class_subjects;
CREATE POLICY "ClassSubjects: Allow headteacher update"
ON public.class_subjects FOR UPDATE
TO authenticated
USING (
    school_id = (SELECT school_id FROM public.staff_profiles WHERE id = auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE id = auth.uid() 
        AND (LOWER(role) = 'headteacher' OR LOWER(role) = 'admin')
    )
);

-- ── 5. REFRESH CACHE ─────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
