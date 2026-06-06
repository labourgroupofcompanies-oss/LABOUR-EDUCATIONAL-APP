-- ============================================================================
-- FIX: Parent Portal Balance Always Wrong
-- ============================================================================
-- Root Causes:
--   1. fee_structures has no class_id (UUID) column — the function relied on
--      cl.id_local which is always NULL → term fee lookup returned 0
--   2. fee_payments has no is_deleted column → would cause a 400 error once
--      Bug #1 was resolved
-- ============================================================================
-- This migration:
--   1. Ensures all tables have required local ID and sync columns (safe, IF NOT EXISTS)
--   2. Redeploys login_parent_portal using reliable UUID-based joins
-- ============================================================================

-- STEP 1: Ensure all required columns exist across tables
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS class_id_local INTEGER;
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS class_id UUID;
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS id_local INTEGER;
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS student_id_local INTEGER;
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS class_id_local INTEGER;
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS student_id UUID;
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS is_voided BOOLEAN DEFAULT false;
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

-- STEP 2: Redeploy login_parent_portal with correct, reliable balance calculation
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

    -- Fetch guardian name
    SELECT guardian_name INTO guardian_name_val
    FROM public.students
    WHERE guardian_primary_contact = phone_input AND is_deleted = false
    LIMIT 1;

    -- Build children array with school logo, student photo, and accurate outstanding balance
    SELECT json_agg(json_build_object(
        'id',            s.id,
        'fullName',      s.full_name,
        'gender',        s.gender,
        'classId',       s.class_id,
        'className',     COALESCE(cl.name, 'Unassigned'),
        'schoolId',      s.school_id,
        'schoolName',    sch.school_name,
        'schoolLogoUrl', sch.logo,
        'arrears', COALESCE(
            (
                -- 1. Get the class term fee amount for the current active term and year
                COALESCE(
                    (
                        SELECT tf.term_fee_amount
                        FROM public.fee_structures tf
                        WHERE tf.school_id = s.school_id
                          -- Match via class UUID or fallback to local integer ID
                          AND (tf.class_id = s.class_id OR (tf.class_id_local = cl.id_local AND cl.id_local IS NOT NULL))
                          AND tf.term = COALESCE(
                              (SELECT val.value #>> '{}'
                               FROM public.settings val
                               WHERE val.school_id = s.school_id
                                 AND val.key = 'currentTerm'
                               LIMIT 1),
                               'Term 1'
                          )
                          AND tf.year = COALESCE(
                              NULLIF(split_part(
                                  COALESCE(
                                      (SELECT val.value #>> '{}'
                                       FROM public.settings val
                                       WHERE val.school_id = s.school_id
                                         AND val.key = 'academicYear'
                                       LIMIT 1),
                                      '2025/2026'
                                  ),
                                  '/', 1
                              ), '')::integer,
                              extract(year from now())::integer
                          )
                        LIMIT 1
                    ),
                    0
                )
                -- 2. Plus brought-forward arrears stored on student record
                + COALESCE(s.arrears, 0)
                -- 3. Minus total valid payments for this student
                - COALESCE(
                    (
                        SELECT SUM(pay.amount_paid)
                        FROM public.fee_payments pay
                        WHERE (pay.student_id = s.id OR (pay.student_id_local = s.id_local AND s.id_local IS NOT NULL))
                          AND COALESCE(pay.is_voided, false) = false
                          AND COALESCE(pay.is_deleted, false) = false
                    ),
                    0
                )
            ),
            0
        ),
        'photoUrl',      s.photo_url
    )) INTO child_records
    FROM public.students s
    JOIN  public.schools  sch ON s.school_id = sch.id
    LEFT JOIN public.classes cl  ON s.class_id = cl.id
    WHERE s.guardian_primary_contact = phone_input
      AND s.is_deleted = false;

    -- Update last login timestamp
    UPDATE public.parent_accounts
    SET last_login = now()
    WHERE phone_number = phone_input;

    RETURN json_build_object(
        'success', true,
        'message', 'Login successful.',
        'parent', json_build_object(
            'id',           phone_input,
            'phoneNumber',  phone_input,
            'guardianName', guardian_name_val,
            'children',     COALESCE(child_records, '[]'::json)
        )
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.login_parent_portal(text, text) TO anon, authenticated;
