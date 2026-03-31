-- 1. Create Attendance Table
CREATE TABLE IF NOT EXISTS public.attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    date date NOT NULL,
    status text NOT NULL CHECK (status IN ('present', 'absent', 'late')),
    entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    is_deleted boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Ensure a student only has one attendance record per school per day
    UNIQUE(school_id, student_id, date)
);

-- 2. Enable Row Level Security
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- 3. Create Policies
-- View attendance in own school
DROP POLICY IF EXISTS "Users can view attendance for their school" ON public.attendance;
CREATE POLICY "Users can view attendance for their school"
ON public.attendance
FOR SELECT
TO authenticated
USING (
    school_id IN (
        SELECT school_id
        FROM public.staff_profiles
        WHERE id = auth.uid()
    )
);

-- Insert attendance in own school
DROP POLICY IF EXISTS "Users can insert attendance for their school" ON public.attendance;
CREATE POLICY "Users can insert attendance for their school"
ON public.attendance
FOR INSERT
TO authenticated
WITH CHECK (
    school_id IN (
        SELECT school_id
        FROM public.staff_profiles
        WHERE id = auth.uid()
    )
);

-- Update attendance in own school
DROP POLICY IF EXISTS "Users can update attendance for their school" ON public.attendance;
CREATE POLICY "Users can update attendance for their school"
ON public.attendance
FOR UPDATE
TO authenticated
USING (
    school_id IN (
        SELECT school_id
        FROM public.staff_profiles
        WHERE id = auth.uid()
    )
)
WITH CHECK (
    school_id IN (
        SELECT school_id
        FROM public.staff_profiles
        WHERE id = auth.uid()
    )
);

-- 4. Trigger for updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_attendance_updated_at') THEN
        CREATE TRIGGER set_attendance_updated_at
        BEFORE UPDATE ON public.attendance
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
END $$;
