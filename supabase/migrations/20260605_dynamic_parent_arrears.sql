-- ============================================================================
-- PARENT PORTAL: Dynamic Arrears / Outstanding Balance Calculation
-- ============================================================================
-- Calculates a student's outstanding balance dynamically using the same logic 
-- as the Accountant: Term Fee + Brought-forward Arrears - Total Payments.
-- ============================================================================

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
    
    -- Build children array WITH school logo, student photo, and dynamic outstanding balance calculation
    SELECT json_agg(json_build_object(
        'id',            s.id,
        'fullName',      s.full_name,
        'gender',        s.gender,
        'classId',       s.class_id,
        'className',     COALESCE(cl.name, 'Unassigned'),
        'schoolId',      s.school_id,
        'schoolName',    sch.school_name,
        'schoolLogoUrl', sch.logo,
        'arrears',       COALESCE(
            (
                -- 1. Get the class term fee amount for the current active term and year
                COALESCE(
                    (SELECT tf.term_fee_amount 
                     FROM public.fee_structures tf
                     WHERE tf.school_id = s.school_id 
                       AND tf.class_id_local = s.class_id_local 
                       AND tf.term = COALESCE(
                           (SELECT val.value #>> '{}' FROM public.settings val WHERE val.school_id = s.school_id AND val.key = 'currentTerm'),
                           'Term 1'
                       )
                       AND tf.year = COALESCE(
                           NULLIF(split_part(
                               COALESCE(
                                   (SELECT val.value #>> '{}' FROM public.settings val WHERE val.school_id = s.school_id AND val.key = 'academicYear'),
                                   '2025/2026'
                               ),
                               '/',
                               1
                           ), '')::integer,
                           extract(year from now())::integer
                       )
                     LIMIT 1),
                    0
                )
                -- 2. Plus Brought Forward Arrears
                + COALESCE(s.arrears, 0)
                -- 3. Minus total non-voided, non-deleted payments made
                - COALESCE(
                    (SELECT SUM(pay.amount_paid) 
                     FROM public.fee_payments pay
                     WHERE pay.student_id = s.id 
                       AND pay.is_voided = false 
                       AND pay.is_deleted = false),
                    0
                )
            ),
            0
        ),
        'photoUrl',      s.photo_url
    )) INTO child_records
    FROM public.students s
    JOIN public.schools sch ON s.school_id = sch.id
    LEFT JOIN public.classes cl ON s.class_id = cl.id
    WHERE s.guardian_primary_contact = phone_input AND s.is_deleted = false;
    
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
