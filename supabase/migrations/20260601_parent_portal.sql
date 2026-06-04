-- ============================================================================
-- PARENT PORTAL DATABASE SCHEMA & RLS POLICIES
-- ============================================================================
-- This migration script establishes the parent portal tables, RLS security,
-- and secure public activation helpers.
-- ============================================================================

-- ── 1. Create Parent Accounts Table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parent_accounts (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_number TEXT UNIQUE NOT NULL, -- Must match guardian_primary_contact
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for phone checks
CREATE INDEX IF NOT EXISTS idx_parent_accounts_phone ON public.parent_accounts(phone_number);

-- ── 2. Enable RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.parent_accounts ENABLE ROW LEVEL SECURITY;

-- ── 3. RLS Policies for parent_accounts ──────────────────────────────────────
DROP POLICY IF EXISTS "Parents can view their own account" ON public.parent_accounts;
CREATE POLICY "Parents can view their own account"
    ON public.parent_accounts FOR SELECT
    TO authenticated
    USING (auth.uid() = id OR phone_number = auth.jwt() ->> 'phone');

DROP POLICY IF EXISTS "Parents can update their own account" ON public.parent_accounts;
CREATE POLICY "Parents can update their own account"
    ON public.parent_accounts FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ── 4. Cross-School RLS Policies for Parents on Core Tables ──────────────────

-- SELECT on Students: Allow parents to view students registered under their contact
DROP POLICY IF EXISTS "Parents can view their children" ON public.students;
CREATE POLICY "Parents can view their children"
    ON public.students FOR SELECT
    TO authenticated
    USING (
        guardian_primary_contact = (auth.jwt() ->> 'phone')
        OR EXISTS (
            SELECT 1 FROM public.parent_accounts pa
            WHERE pa.id = auth.uid() AND pa.phone_number = students.guardian_primary_contact
        )
    );

-- SELECT on Results: Allow parents to view results of their children
DROP POLICY IF EXISTS "Parents can view their children's results" ON public.results;
CREATE POLICY "Parents can view their children's results"
    ON public.results FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = results.student_id
            AND (
                s.guardian_primary_contact = (auth.jwt() ->> 'phone')
                OR EXISTS (
                    SELECT 1 FROM public.parent_accounts pa
                    WHERE pa.id = auth.uid() AND pa.phone_number = s.guardian_primary_contact
                )
            )
        )
    );

-- SELECT on Component Scores: Allow parents to view detailed test/exam scores
DROP POLICY IF EXISTS "Parents can view their children's component scores" ON public.component_scores;
CREATE POLICY "Parents can view their children's component scores"
    ON public.component_scores FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = component_scores.student_id
            AND (
                s.guardian_primary_contact = (auth.jwt() ->> 'phone')
                OR EXISTS (
                    SELECT 1 FROM public.parent_accounts pa
                    WHERE pa.id = auth.uid() AND pa.phone_number = s.guardian_primary_contact
                )
            )
        )
    );

-- SELECT on Attendance: Allow parents to view attendance logs
DROP POLICY IF EXISTS "Parents can view their children's attendance" ON public.attendance;
CREATE POLICY "Parents can view their children's attendance"
    ON public.attendance FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = attendance.student_id
            AND (
                s.guardian_primary_contact = (auth.jwt() ->> 'phone')
                OR EXISTS (
                    SELECT 1 FROM public.parent_accounts pa
                    WHERE pa.id = auth.uid() AND pa.phone_number = s.guardian_primary_contact
                )
            )
        )
    );

-- SELECT on Fee Payments: Allow parents to view receipts/ledgers
DROP POLICY IF EXISTS "Parents can view their children's fee payments" ON public.fee_payments;
CREATE POLICY "Parents can view their children's fee payments"
    ON public.fee_payments FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = fee_payments.student_id
            AND (
                s.guardian_primary_contact = (auth.jwt() ->> 'phone')
                OR EXISTS (
                    SELECT 1 FROM public.parent_accounts pa
                    WHERE pa.id = auth.uid() AND pa.phone_number = s.guardian_primary_contact
                )
            )
        )
    );

-- SELECT on Fee Structures: Allow parents to view class term fees
DROP POLICY IF EXISTS "Parents can view their children's fee structures" ON public.fee_structures;
CREATE POLICY "Parents can view their children's fee structures"
    ON public.fee_structures FOR SELECT
    TO authenticated
    USING (
        school_id IN (
            SELECT school_id FROM public.students s
            WHERE s.guardian_primary_contact = (auth.jwt() ->> 'phone')
            OR EXISTS (
                SELECT 1 FROM public.parent_accounts pa
                WHERE pa.id = auth.uid() AND pa.phone_number = s.guardian_primary_contact
            )
        )
    );

-- SELECT on Classes: Allow parents to read class info
DROP POLICY IF EXISTS "Parents can view their children's classes" ON public.classes;
CREATE POLICY "Parents can view their children's classes"
    ON public.classes FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.class_id = classes.id
            AND (
                s.guardian_primary_contact = (auth.jwt() ->> 'phone')
                OR EXISTS (
                    SELECT 1 FROM public.parent_accounts pa
                    WHERE pa.id = auth.uid() AND pa.phone_number = s.guardian_primary_contact
                )
            )
        )
    );

-- SELECT on Subjects: Allow parents to read subject names
DROP POLICY IF EXISTS "Parents can view subjects in their children's schools" ON public.subjects;
CREATE POLICY "Parents can view subjects in their children's schools"
    ON public.subjects FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.school_id = subjects.school_id
            AND (
                s.guardian_primary_contact = (auth.jwt() ->> 'phone')
                OR EXISTS (
                    SELECT 1 FROM public.parent_accounts pa
                    WHERE pa.id = auth.uid() AND pa.phone_number = s.guardian_primary_contact
                )
            )
        )
    );

-- SELECT on School Notifications: Allow parents to see school announcements
DROP POLICY IF EXISTS "Parents can view notifications for their children's schools" ON public.school_notifications;
CREATE POLICY "Parents can view notifications for their children's schools"
    ON public.school_notifications FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.school_id = school_notifications.school_id
            AND (
                s.guardian_primary_contact = (auth.jwt() ->> 'phone')
                OR EXISTS (
                    SELECT 1 FROM public.parent_accounts pa
                    WHERE pa.id = auth.uid() AND pa.phone_number = s.guardian_primary_contact
                )
            )
        )
    );

-- ── 5. Secure Definer Function for Portal Activation Checks ──────────────────
-- Allows unauthenticated parents to verify their primary contact and retrieve
-- their linked children across any school, safely without exposing directory access.

CREATE OR REPLACE FUNCTION public.check_parent_activation_status(phone_input text)
RETURNS json
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    guardian_name_val text;
    is_active_val boolean := false;
    child_records json;
    result json;
    phone_clean text;
BEGIN
    -- Normalize and clean input (remove whitespace)
    phone_clean := trim(phone_input);
    
    -- Check if parent account exists in our table
    SELECT is_active INTO is_active_val 
    FROM public.parent_accounts 
    WHERE phone_number = phone_clean;
    
    -- Fetch the guardian name (take the first matching student record that isn't deleted)
    SELECT guardian_name INTO guardian_name_val
    FROM public.students
    WHERE guardian_primary_contact = phone_clean AND is_deleted = false
    LIMIT 1;
    
    -- If no student is found with this guardian primary contact, return not found
    IF guardian_name_val IS NULL THEN
        RETURN json_build_object(
            'exists', false,
            'is_active', false,
            'guardian_name', null,
            'children', '[]'::json
        );
    END IF;
    
    -- Fetch children details (including full name, class name, and school name)
    SELECT json_agg(json_build_object(
        'full_name', s.full_name,
        'school_name', sch.school_name,
        'class_name', cl.name
    )) INTO child_records
    FROM public.students s
    JOIN public.schools sch ON s.school_id = sch.id
    LEFT JOIN public.classes cl ON s.class_id = cl.id
    WHERE s.guardian_primary_contact = phone_clean AND s.is_deleted = false;

    -- Return full structured JSON response
    RETURN json_build_object(
        'exists', true,
        'is_active', COALESCE(is_active_val, false),
        'guardian_name', guardian_name_val,
        'children', COALESCE(child_records, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql;

-- Grant execution permission to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public.check_parent_activation_status(text) TO anon, authenticated;
