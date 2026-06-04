-- ============================================================================
-- PARENT PORTAL CUSTOM CRYPTOGRAPHIC AUTHENTICATION
-- ============================================================================
-- This migration script implements pgcrypto custom hashing for parent portals,
-- allowing phone activation and login without Supabase Auth or SMS gateways.
-- ============================================================================

-- ── 1. Enable Cryptographic Extensions ───────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 2. Create Standalone Parent Accounts Table ───────────────────────────────
DROP TABLE IF EXISTS public.parent_accounts CASCADE;

CREATE TABLE IF NOT EXISTS public.parent_accounts (
    phone_number TEXT PRIMARY KEY,    -- The primary contact registered with students
    password_hash TEXT NOT NULL,      -- Blowfish crypt hashed password
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for phone checks
CREATE INDEX IF NOT EXISTS idx_parent_accounts_phone_custom ON public.parent_accounts(phone_number);

-- ── 3. Custom Activation RPC ──────────────────────────────────────────────────
-- Securely hashes the plain text password and upserts the parent account.
CREATE OR REPLACE FUNCTION public.activate_parent_portal(phone_input text, password_input text)
RETURNS json
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    hashed_password text;
    exists_val boolean;
BEGIN
    -- Normalize
    phone_input := trim(phone_input);
    
    -- Verify that the student contact is registered
    SELECT EXISTS (
        SELECT 1 FROM public.students 
        WHERE guardian_primary_contact = phone_input AND is_deleted = false
    ) INTO exists_val;
    
    IF NOT exists_val THEN
        RETURN json_build_object('success', false, 'message', 'This phone number is not registered with any student.');
    END IF;
    
    -- Hash the password using Blowfish (BF)
    hashed_password := crypt(password_input, gen_salt('bf', 8));
    
    -- Upsert
    INSERT INTO public.parent_accounts (phone_number, password_hash, is_active)
    VALUES (phone_input, hashed_password, true)
    ON CONFLICT (phone_number) 
    DO UPDATE SET password_hash = hashed_password, updated_at = now();
    
    RETURN json_build_object('success', true, 'message', 'Portal activated successfully.');
END;
$$ LANGUAGE plpgsql;

-- ── 4. Custom Login Verification RPC ─────────────────────────────────────────
-- Cryptographically verifies phone and password, then returns parent dashboard profile.
CREATE OR REPLACE FUNCTION public.login_parent_portal(phone_input text, password_input text)
RETURNS json
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    db_password_hash text;
    is_active_val boolean;
    guardian_name_val text;
    child_records json;
BEGIN
    phone_input := trim(phone_input);
    
    -- Fetch account info
    SELECT password_hash, is_active INTO db_password_hash, is_active_val
    FROM public.parent_accounts
    WHERE phone_number = phone_input;
    
    IF db_password_hash IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Account not yet activated.');
    END IF;
    
    IF NOT is_active_val THEN
        RETURN json_build_object('success', false, 'message', 'This portal is disabled.');
    END IF;
    
    -- Verify Blowfish crypt hash
    IF crypt(password_input, db_password_hash) <> db_password_hash THEN
        RETURN json_build_object('success', false, 'message', 'Incorrect password.');
    END IF;
    
    -- Success! Fetch profile info to return
    SELECT guardian_name INTO guardian_name_val
    FROM public.students
    WHERE guardian_primary_contact = phone_input AND is_deleted = false
    LIMIT 1;
    
    SELECT json_agg(json_build_object(
        'id', s.id,
        'fullName', s.full_name,
        'gender', s.gender,
        'classId', s.class_id,
        'className', COALESCE(cl.name, 'Unassigned'),
        'schoolId', s.school_id,
        'schoolName', sch.school_name,
        'arrears', COALESCE(s.arrears, 0),
        'photoUrl', s.photo_url
    )) INTO child_records
    FROM public.students s
    JOIN public.schools sch ON s.school_id = sch.id
    LEFT JOIN public.classes cl ON s.class_id = cl.id
    WHERE s.guardian_primary_contact = phone_input AND s.is_deleted = false;
    
    -- Log last login
    UPDATE public.parent_accounts 
    SET last_login = now() 
    WHERE phone_number = phone_input;
    
    RETURN json_build_object(
        'success', true,
        'message', 'Login successful.',
        'parent', json_build_object(
            'id', phone_input, -- phone number serves as parent ID in custom auth
            'phoneNumber', phone_input,
            'guardianName', guardian_name_val,
            'children', COALESCE(child_records, '[]'::json)
        )
    );
END;
$$ LANGUAGE plpgsql;

-- ── 5. Secure Dashboard Fetch RPCs ──────────────────────────────────────────

-- Get Results (Verifies password on call)
CREATE OR REPLACE FUNCTION public.get_parent_results(phone_input text, password_input text, student_uuid uuid)
RETURNS json
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    db_password_hash text;
    is_active_val boolean;
    records json;
BEGIN
    phone_input := trim(phone_input);
    
    SELECT password_hash, is_active INTO db_password_hash, is_active_val
    FROM public.parent_accounts
    WHERE phone_number = phone_input;
    
    IF db_password_hash IS NULL OR NOT is_active_val OR crypt(password_input, db_password_hash) <> db_password_hash THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized context');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM public.students 
        WHERE id = student_uuid AND guardian_primary_contact = phone_input AND is_deleted = false
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Access denied');
    END IF;
    
    SELECT json_agg(json_build_object(
        'ca_total', r.ca_total,
        'exam_score', r.exam_score,
        'total_score', r.total_score,
        'grade', r.grade,
        'remarks', r.remarks,
        'term', r.term,
        'year', r.year,
        'subject_name', sub.name
    )) INTO records
    FROM public.results r
    JOIN public.subjects sub ON (r.subject_id = sub.id)
    WHERE r.student_id = student_uuid AND r.is_deleted = false;
    
    RETURN json_build_object('success', true, 'results', COALESCE(records, '[]'::json));
END;
$$ LANGUAGE plpgsql;

-- Get Fees History (Verifies password on call)
CREATE OR REPLACE FUNCTION public.get_parent_fees(phone_input text, password_input text, student_uuid uuid)
RETURNS json
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    db_password_hash text;
    is_active_val boolean;
    records json;
BEGIN
    phone_input := trim(phone_input);
    
    SELECT password_hash, is_active INTO db_password_hash, is_active_val
    FROM public.parent_accounts
    WHERE phone_number = phone_input;
    
    IF db_password_hash IS NULL OR NOT is_active_val OR crypt(password_input, db_password_hash) <> db_password_hash THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized context');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM public.students 
        WHERE id = student_uuid AND guardian_primary_contact = phone_input AND is_deleted = false
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Access denied');
    END IF;
    
    SELECT json_agg(t) INTO records
    FROM (
        SELECT 
            f.receipt_no,
            f.amount_paid,
            f.payment_method,
            f.payment_date,
            f.notes,
            f.term,
            f.year
        FROM public.fee_payments f
        WHERE f.student_id = student_uuid AND f.is_deleted = false
        ORDER BY f.payment_date DESC
    ) t;
    
    RETURN json_build_object('success', true, 'fees', COALESCE(records, '[]'::json));
END;
$$ LANGUAGE plpgsql;

-- Get Attendance Log (Verifies password on call)
CREATE OR REPLACE FUNCTION public.get_parent_attendance(phone_input text, password_input text, student_uuid uuid)
RETURNS json
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    db_password_hash text;
    is_active_val boolean;
    records json;
BEGIN
    phone_input := trim(phone_input);
    
    SELECT password_hash, is_active INTO db_password_hash, is_active_val
    FROM public.parent_accounts
    WHERE phone_number = phone_input;
    
    IF db_password_hash IS NULL OR NOT is_active_val OR crypt(password_input, db_password_hash) <> db_password_hash THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized context');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM public.students 
        WHERE id = student_uuid AND guardian_primary_contact = phone_input AND is_deleted = false
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Access denied');
    END IF;
    
    SELECT json_agg(t) INTO records
    FROM (
        SELECT 
            a.date,
            a.status
        FROM public.attendance a
        WHERE a.student_id = student_uuid AND a.is_deleted = false
        ORDER BY a.date DESC
    ) t;
    
    RETURN json_build_object('success', true, 'attendance', COALESCE(records, '[]'::json));
END;
$$ LANGUAGE plpgsql;

-- Get Announcements Board (Verifies password on call)
CREATE OR REPLACE FUNCTION public.get_parent_announcements(phone_input text, password_input text, school_uuid uuid)
RETURNS json
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    db_password_hash text;
    is_active_val boolean;
    records json;
BEGIN
    phone_input := trim(phone_input);
    
    SELECT password_hash, is_active INTO db_password_hash, is_active_val
    FROM public.parent_accounts
    WHERE phone_number = phone_input;
    
    IF db_password_hash IS NULL OR NOT is_active_val OR crypt(password_input, db_password_hash) <> db_password_hash THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized context');
    END IF;
    
    -- Verify parent actually has an active student in this school
    IF NOT EXISTS (
        SELECT 1 FROM public.students 
        WHERE school_id = school_uuid AND guardian_primary_contact = phone_input AND is_deleted = false
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Access denied');
    END IF;
    
    SELECT json_agg(t) INTO records
    FROM (
        SELECT 
            n.id,
            n.title,
            n.message,
            n.priority,
            n.created_at
        FROM public.school_notifications n
        WHERE n.school_id = school_uuid
        ORDER BY n.created_at DESC
    ) t;
    
    RETURN json_build_object('success', true, 'announcements', COALESCE(records, '[]'::json));
END;
$$ LANGUAGE plpgsql;

-- Grant execution permission on all RPCs to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public.activate_parent_portal(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_parent_portal(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_results(text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_fees(text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_attendance(text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_announcements(text, text, uuid) TO anon, authenticated;
