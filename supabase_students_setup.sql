-- ==========================================
-- CREATE students TABLE
-- ==========================================

DROP TABLE IF EXISTS public.students CASCADE;

CREATE TABLE public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
    student_id_string TEXT, 
    
    full_name TEXT NOT NULL,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female')),
    date_of_birth DATE,
    religion TEXT,
    residential_address TEXT,
    is_boarding BOOLEAN DEFAULT false,
    arrears NUMERIC(10, 2) DEFAULT 0,
    
    -- Guardian Information
    guardian_name TEXT NOT NULL,
    guardian_primary_contact TEXT NOT NULL,
    guardian_secondary_contact TEXT,
    guardian_email TEXT,
    guardian_occupation TEXT,
    
    -- Media and Status
    photo_url TEXT,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    
    -- Timestamps for Sync
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Standard UNIQUE constraint automatically treats NULLs as distinct,
    -- allowing multiple students without a student_id_string but preventing 
    -- duplicates when one is assigned within the same school.
    CONSTRAINT uq_school_student_id UNIQUE (school_id, student_id_string)
);

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================

CREATE INDEX idx_students_school_id ON public.students(school_id);
CREATE INDEX idx_students_class_id ON public.students(class_id);
CREATE INDEX idx_students_full_name ON public.students(full_name);
CREATE INDEX idx_students_is_deleted ON public.students(is_deleted) WHERE is_deleted = false;

-- ==========================================
-- ENABLE ROW LEVEL SECURITY
-- ==========================================

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- RLS POLICIES
-- ==========================================

-- Policy: Select (Users can only view students in their school)
CREATE POLICY "Users can view students in their school" 
ON public.students 
FOR SELECT 
USING (school_id = public.my_school_id());

-- Policy: Insert (Users can only insert students into their school)
CREATE POLICY "Users can insert students into their school" 
ON public.students 
FOR INSERT 
WITH CHECK (school_id = public.my_school_id());

-- Policy: Update (Users can only update students in their school)
CREATE POLICY "Users can update students in their school" 
ON public.students 
FOR UPDATE 
USING (school_id = public.my_school_id())
WITH CHECK (school_id = public.my_school_id());

-- Policy: Delete (Users can only delete students in their school)
CREATE POLICY "Users can delete students in their school" 
ON public.students 
FOR DELETE 
USING (school_id = public.my_school_id());

-- ==========================================
-- TRIGGERS (Auto-update updated_at)
-- ==========================================

-- Create the trigger function if it does not already exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_students_updated_at ON public.students;
CREATE TRIGGER update_students_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
