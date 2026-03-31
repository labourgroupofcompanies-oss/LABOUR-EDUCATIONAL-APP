-- Migration: Create Class Management schema
-- Description: Creates `subjects`, `classes`, and `class_subjects` tables with strict relational integrity,
-- soft deletion support, and partial unique indexes.

-- 1. Create or replace the updated_at trigger function 
-- (Assumes it may already exist or creates it if it doesn't)
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

--------------------------------------------------------------------------------
-- TABLE: subjects
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index for active subjects
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_subject_name
ON subjects (school_id, name)
WHERE is_deleted = false;

DROP TRIGGER IF EXISTS update_subjects_modtime ON subjects;
CREATE TRIGGER update_subjects_modtime
    BEFORE UPDATE ON subjects
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();


--------------------------------------------------------------------------------
-- TABLE: classes
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    level TEXT NOT NULL,
    class_teacher_id UUID NULL REFERENCES staff_profiles(id) ON DELETE SET NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index for active classes (ignores deleted rows)
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_class_name_level
ON classes (school_id, name, level)
WHERE is_deleted = false;

DROP TRIGGER IF EXISTS update_classes_modtime ON classes;
CREATE TRIGGER update_classes_modtime
    BEFORE UPDATE ON classes
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();


--------------------------------------------------------------------------------
-- TABLE: class_subjects
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id UUID NULL REFERENCES staff_profiles(id) ON DELETE SET NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index for active class subjects
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_class_subject
ON class_subjects (class_id, subject_id)
WHERE is_deleted = false;

DROP TRIGGER IF EXISTS update_class_subjects_modtime ON class_subjects;
CREATE TRIGGER update_class_subjects_modtime
    BEFORE UPDATE ON class_subjects
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();


--------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------------------------------------------------
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;

-- -----------------
-- Policies for `subjects`
-- -----------------
DROP POLICY IF EXISTS "Enable read access for all users within the same school" ON subjects;
CREATE POLICY "Enable read access for all users within the same school"
ON subjects FOR SELECT
USING (
    school_id = (SELECT school_id FROM staff_profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Enable insert access for headteachers/admins in same school" ON subjects;
CREATE POLICY "Enable insert access for headteachers/admins in same school"
ON subjects FOR INSERT
WITH CHECK (
    school_id = (SELECT school_id FROM staff_profiles WHERE id = auth.uid())
    AND EXISTS (
        SELECT 1 FROM staff_profiles
        WHERE id = auth.uid() AND role IN ('Headteacher', 'Admin')
    )
);

DROP POLICY IF EXISTS "Enable update access for headteachers/admins in same school" ON subjects;
CREATE POLICY "Enable update access for headteachers/admins in same school"
ON subjects FOR UPDATE
USING (
    school_id = (SELECT school_id FROM staff_profiles WHERE id = auth.uid())
    AND EXISTS (
        SELECT 1 FROM staff_profiles
        WHERE id = auth.uid() AND role IN ('Headteacher', 'Admin')
    )
);

-- -----------------
-- Policies for `classes`
-- -----------------
-- Ensure users can only see classes from their own school
DROP POLICY IF EXISTS "Enable read access for all users within the same school" ON classes;
CREATE POLICY "Enable read access for all users within the same school"
ON classes FOR SELECT
USING (
    school_id = (SELECT school_id FROM staff_profiles WHERE id = auth.uid())
);

-- Only Headteachers or Admins can insert/update classes
DROP POLICY IF EXISTS "Enable insert access for headteachers/admins in same school" ON classes;
CREATE POLICY "Enable insert access for headteachers/admins in same school"
ON classes FOR INSERT
WITH CHECK (
    school_id = (SELECT school_id FROM staff_profiles WHERE id = auth.uid())
    AND EXISTS (
        SELECT 1 FROM staff_profiles
        WHERE id = auth.uid() AND role IN ('Headteacher', 'Admin')
    )
);

DROP POLICY IF EXISTS "Enable update access for headteachers/admins in same school" ON classes;
CREATE POLICY "Enable update access for headteachers/admins in same school"
ON classes FOR UPDATE
USING (
    school_id = (SELECT school_id FROM staff_profiles WHERE id = auth.uid())
    AND EXISTS (
        SELECT 1 FROM staff_profiles
        WHERE id = auth.uid() AND role IN ('Headteacher', 'Admin')
    )
);

-- -----------------
-- Policies for `class_subjects`
-- -----------------
-- Ensure users can only see assignments from their own school
DROP POLICY IF EXISTS "Enable read access for all users within the same school" ON class_subjects;
CREATE POLICY "Enable read access for all users within the same school"
ON class_subjects FOR SELECT
USING (
    school_id = (SELECT school_id FROM staff_profiles WHERE id = auth.uid())
);

-- Only Headteachers or Admins can insert/update class subjects
DROP POLICY IF EXISTS "Enable insert access for headteachers/admins in same school" ON class_subjects;
CREATE POLICY "Enable insert access for headteachers/admins in same school"
ON class_subjects FOR INSERT
WITH CHECK (
    school_id = (SELECT school_id FROM staff_profiles WHERE id = auth.uid())
    AND EXISTS (
        SELECT 1 FROM staff_profiles
        WHERE id = auth.uid() AND role IN ('Headteacher', 'Admin')
    )
);

DROP POLICY IF EXISTS "Enable update access for headteachers/admins in same school" ON class_subjects;
CREATE POLICY "Enable update access for headteachers/admins in same school"
ON class_subjects FOR UPDATE
USING (
    school_id = (SELECT school_id FROM staff_profiles WHERE id = auth.uid())
    AND EXISTS (
        SELECT 1 FROM staff_profiles
        WHERE id = auth.uid() AND role IN ('Headteacher', 'Admin')
    )
);
