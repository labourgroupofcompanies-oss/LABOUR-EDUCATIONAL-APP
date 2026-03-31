-- LABOUR-APP SYSTEM: Cloud Schema for Supabase

-- Enable Row Level Security (RLS)
-- Each row will have a school_id to isolate data between schools

-- 1. Schools Table
CREATE TABLE IF NOT EXISTS public.schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT UNIQUE NOT NULL,
    school_name TEXT NOT NULL,
    school_type TEXT NOT NULL,
    region TEXT,
    district TEXT,
    headteacher_name TEXT,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    onboarding_term TEXT,
    onboarding_academic_year TEXT,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('HEADTEACHER', 'TEACHER', 'ACCOUNTANT')),
    phone_number TEXT,
    email TEXT,
    gender TEXT,
    address TEXT,
    qualification TEXT,
    specialization TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, username)
);

-- 3. Subjects Table
CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, name)
);

-- 4. Classes Table
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    teacher_id TEXT, -- References user username or ID
    name TEXT NOT NULL,
    level TEXT,
    subjects JSONB DEFAULT '[]', -- Array of subject references
    subject_teachers JSONB DEFAULT '[]', -- Array of {subjectId, teacherId}
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, name)
);

-- 5. Students Table
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    class_id_local INTEGER, -- Reference to Dexie ID for mapping
    student_id_string TEXT, -- Unique Student ID (STU-...)
    name TEXT NOT NULL,
    gender TEXT,
    date_of_birth TIMESTAMPTZ,
    photo_url TEXT,
    religion TEXT,
    residential_address TEXT,
    guardian JSONB,
    is_boarding BOOLEAN DEFAULT false,
    arrears NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, name)
);

-- 6. Results / Component Scores
CREATE TABLE IF NOT EXISTS public.component_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    student_id_local INTEGER,
    subject_id_local INTEGER,
    class_id_local INTEGER,
    year INTEGER,
    term TEXT,
    component_type TEXT, -- test, exercise, assignment, project, exam
    component_number INTEGER,
    score NUMERIC(5,2),
    entered_by_local INTEGER,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, student_id_local, subject_id_local, class_id_local, year, term, component_type, component_number)
);

-- 7. Fee Management
CREATE TABLE IF NOT EXISTS public.fee_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    class_id_local INTEGER,
    class_name TEXT,
    term_fee_amount NUMERIC(15,2),
    term TEXT,
    year INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, class_id_local, term, year)
);

CREATE TABLE IF NOT EXISTS public.fee_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    student_id_local INTEGER,
    student_name TEXT,
    class_id_local INTEGER,
    term TEXT,
    year INTEGER,
    amount_paid NUMERIC(15,2),
    payment_method TEXT,
    payment_date TIMESTAMPTZ,
    receipt_no TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, student_id_local, receipt_no)
);

-- 8. Payroll and Expenses
CREATE TABLE IF NOT EXISTS public.payroll_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    staff_id_local INTEGER,
    staff_name TEXT,
    staff_role TEXT,
    month INTEGER,
    year INTEGER,
    gross_salary NUMERIC(15,2),
    deductions NUMERIC(15,2),
    deduction_notes TEXT,
    net_pay NUMERIC(15,2),
    payment_method TEXT,
    status TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, staff_id_local, month, year)
);

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    category TEXT,
    description TEXT,
    amount NUMERIC(15,2),
    date TIMESTAMPTZ,
    receipt_note TEXT,
    added_by_local INTEGER,
    voided BOOLEAN DEFAULT false,
    void_reason TEXT,
    voided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, category, description, date, amount)
);

CREATE TABLE IF NOT EXISTS public.results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    student_id_local INTEGER,
    subject_id_local INTEGER,
    class_id_local INTEGER,
    term TEXT,
    year INTEGER,
    ca_total NUMERIC(10,2),
    exam_score NUMERIC(10,2),
    total_score NUMERIC(10,2),
    grade TEXT,
    remarks TEXT,
    status TEXT DEFAULT 'draft',
    entered_by_local INTEGER,
    submitted_at TIMESTAMPTZ,
    approved_by_local INTEGER,
    approved_at TIMESTAMPTZ,
    locked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, student_id_local, subject_id_local, class_id_local, term, year)
);

CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    student_id_local INTEGER,
    class_id_local INTEGER,
    date TIMESTAMPTZ,
    status TEXT, -- present, absent, late
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, student_id_local, class_id_local, date)
);

CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, key)
);

CREATE TABLE IF NOT EXISTS public.assessment_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
    year INTEGER,
    term TEXT,
    num_tests INTEGER,
    num_exercises INTEGER,
    num_assignments INTEGER,
    num_projects INTEGER,
    ca_percentage INTEGER,
    exam_percentage INTEGER,
    test_weight INTEGER,
    exercise_weight INTEGER,
    assignment_weight INTEGER,
    project_weight INTEGER,
    results_locked BOOLEAN DEFAULT false,
    ca_policy TEXT,
    best_n_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(school_id, year, term)
);

-- Enable RLS on all tables
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.component_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_configs ENABLE ROW LEVEL SECURITY;

-- Note: Policies will be added in a separate script or manually to ensure school_id isolation.

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION SCRIPT (Run these if the initial CREATE TABLE didn't add constraints)
-- ─────────────────────────────────────────────────────────────────────────────

/*
-- 1. Add missing unique constraints
ALTER TABLE public.users ADD CONSTRAINT users_school_id_username_key UNIQUE (school_id, username);
ALTER TABLE public.subjects ADD CONSTRAINT subjects_school_id_name_key UNIQUE (school_id, name);
ALTER TABLE public.classes ADD CONSTRAINT classes_school_id_name_key UNIQUE (school_id, name);
ALTER TABLE public.students ADD CONSTRAINT students_school_id_name_key UNIQUE (school_id, name);
ALTER TABLE public.component_scores ADD CONSTRAINT component_scores_unique_entry UNIQUE (school_id, student_id_local, subject_id_local, class_id_local, year, term, component_type, component_number);
ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_unique_term UNIQUE (school_id, class_id_local, term, year);
ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_unique_receipt UNIQUE (school_id, student_id_local, receipt_no);
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_unique_record UNIQUE (school_id, staff_id_local, month, year);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_unique_expense UNIQUE (school_id, category, description, date, amount);
ALTER TABLE public.results ADD CONSTRAINT results_unique_score UNIQUE (school_id, student_id_local, subject_id_local, class_id_local, term, year);
ALTER TABLE public.attendance ADD CONSTRAINT attendance_unique_log UNIQUE (school_id, student_id_local, class_id_local, date);
ALTER TABLE public.settings ADD CONSTRAINT settings_unique_key UNIQUE (school_id, key);
ALTER TABLE public.assessment_configs ADD CONSTRAINT assessment_configs_unique_term UNIQUE (school_id, year, term);

-- 2. Add missing columns to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS qualification TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS specialization TEXT;
*/
