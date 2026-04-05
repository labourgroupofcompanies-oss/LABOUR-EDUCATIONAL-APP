-- ============================================================
-- Migration: 20260405_graduate_records
-- Creates the graduate_records table for the Headteacher portal
-- ============================================================

-- Create the table
CREATE TABLE IF NOT EXISTS public.graduate_records (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id    UUID REFERENCES public.students(id) ON DELETE SET NULL,
    full_name     TEXT NOT NULL,
    graduation_year  INTEGER NOT NULL,
    graduation_term  TEXT NOT NULL,
    final_class   TEXT NOT NULL,
    gender        TEXT,

    -- Academic snapshot
    overall_average  NUMERIC(5,2),
    total_subjects   INTEGER,
    passed_subjects  INTEGER,
    final_grade      TEXT,
    academic_summary TEXT,

    -- Financial snapshot
    total_fees_paid      NUMERIC(12,2) DEFAULT 0,
    outstanding_balance  NUMERIC(12,2) DEFAULT 0,
    fee_status           TEXT CHECK (fee_status IN ('cleared', 'outstanding')),

    -- Headteacher notes
    headteacher_note TEXT,
    noted_by         TEXT,
    noted_at         TIMESTAMPTZ,

    -- Soft delete & sync
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_graduate_records_school_id ON public.graduate_records (school_id);
CREATE INDEX IF NOT EXISTS idx_graduate_records_graduation_year ON public.graduate_records (school_id, graduation_year);
CREATE INDEX IF NOT EXISTS idx_graduate_records_is_deleted ON public.graduate_records (is_deleted);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE public.graduate_records ENABLE ROW LEVEL SECURITY;

-- Allow the school's staff (headteacher) to read/write their own school records
CREATE POLICY "school_staff_manage_graduate_records"
ON public.graduate_records
FOR ALL
USING (
    school_id = public.my_school_id()
)
WITH CHECK (
    school_id = public.my_school_id()
);

-- Developer read-all policy
CREATE POLICY "developer_read_all_graduate_records"
ON public.graduate_records
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE id = auth.uid()
          AND lower(role) = 'developer'
    )
);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_graduate_records_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_graduate_records_updated_at ON public.graduate_records;
CREATE TRIGGER trg_graduate_records_updated_at
BEFORE UPDATE ON public.graduate_records
FOR EACH ROW EXECUTE FUNCTION public.set_graduate_records_updated_at();
