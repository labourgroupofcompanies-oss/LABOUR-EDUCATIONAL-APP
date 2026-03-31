-- ============================================================
--  SEED PART 2: Link School + Headteacher Profile
--
--  Run this AFTER you create the auth user in Supabase Dashboard.
--  See instructions below.
-- ============================================================

-- Fill these in to match what you used in the Dashboard:
DO $$
DECLARE
  v_school_name   TEXT := 'Ghana High School';    -- ← CHANGE THIS
  v_school_code   TEXT := 'GHS-001';              -- ← CHANGE THIS
  v_username      TEXT := 'headteacher';          -- ← CHANGE THIS
  v_full_name     TEXT := 'Mr. Ray';              -- ← CHANGE THIS

  -- Paste the UUID of the user you created in Supabase Dashboard:
  v_user_id       UUID := 'fc0973da-e235-4487-99e8-aeb4e423b407'; -- ← PASTE UUID HERE

  v_school_id     UUID;
  v_auth_email    TEXT;
BEGIN
  -- Create the school
  INSERT INTO public.schools (school_name, school_code)
  VALUES (v_school_name, v_school_code)
  ON CONFLICT (school_code) DO UPDATE SET school_name = EXCLUDED.school_name
  RETURNING id INTO v_school_id;

  -- Build auth_email (must match what you typed in the Dashboard)
  v_auth_email := LOWER(v_username) || '@' || LOWER(v_school_code) || '.internal';

  -- Create the headteacher profile
  INSERT INTO public.staff_profiles
    (id, school_id, username, full_name, role, auth_email)
  VALUES
    (v_user_id, v_school_id, v_username, v_full_name, 'headteacher', v_auth_email)
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✅ Done!';
  RAISE NOTICE '   School ID  : %', v_school_id;
  RAISE NOTICE '   Auth Email : %', v_auth_email;
  RAISE NOTICE '   Login with → School ID: % | Username: % | Password: (what you set in Dashboard)',
    v_school_code, v_username;
END;
$$;
