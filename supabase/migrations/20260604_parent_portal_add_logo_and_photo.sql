-- ============================================================================
-- PARENT PORTAL: Add School Logo & Student Photo to Login RPC
-- ============================================================================
-- This updates login_parent_portal to return:
--   • schoolLogoUrl  — from schools.logo (base64 or storage URL)
--   • photoUrl       — from students.photo_url (already present, confirmed)
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
    
    -- Build children array WITH school logo and student photo
    SELECT json_agg(json_build_object(
        'id',            s.id,
        'fullName',      s.full_name,
        'gender',        s.gender,
        'classId',       s.class_id,
        'className',     COALESCE(cl.name, 'Unassigned'),
        'schoolId',      s.school_id,
        'schoolName',    sch.school_name,
        'schoolLogoUrl', sch.logo,          -- ← School logo (base64 or URL)
        'arrears',       COALESCE(s.arrears, 0),
        'photoUrl',      s.photo_url        -- ← Student passport photo
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

-- Re-grant execution permissions (unchanged)
GRANT EXECUTE ON FUNCTION public.login_parent_portal(text, text) TO anon, authenticated;
