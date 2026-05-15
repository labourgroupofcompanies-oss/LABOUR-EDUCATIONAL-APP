-- ============================================================
-- SQL Migration: Auth Hardening & Account Locking
-- Date: 2026-05-14
-- ============================================================

BEGIN;

-- 1. Add locking columns to staff_profiles
ALTER TABLE public.staff_profiles 
ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- 2. Create a table for login activity monitoring (Suspicious Login Monitoring)
CREATE TABLE IF NOT EXISTS public.login_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES public.schools(id),
    username TEXT,
    ip_address TEXT, -- Note: Captured via RPC if possible
    status TEXT, -- 'success', 'failed', 'locked'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Update the login resolver to check for locks
CREATE OR REPLACE FUNCTION public.resolve_auth_email(
  p_school_code TEXT,
  p_username    TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_email TEXT;
  v_locked_until TIMESTAMPTZ;
BEGIN
  SELECT sp.auth_email, sp.locked_until
  INTO v_auth_email, v_locked_until
  FROM public.staff_profiles sp
  JOIN public.schools s ON s.id = sp.school_id
  WHERE LOWER(s.school_code) = LOWER(p_school_code)
  AND LOWER(sp.username)   = LOWER(p_username)
  LIMIT 1;

  -- Check if account is currently locked
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RAISE EXCEPTION 'ACCOUNT_LOCKED_UNTIL_%', v_locked_until;
  END IF;

  RETURN v_auth_email;
END;
$$;

-- 4. RPC to record a failed attempt (Server-side tracking)
CREATE OR REPLACE FUNCTION public.record_failed_login(
  p_school_code TEXT,
  p_username    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
  v_attempts INT;
BEGIN
  SELECT sp.id, sp.failed_attempts
  INTO v_staff_id, v_attempts
  FROM public.staff_profiles sp
  JOIN public.schools s ON s.id = sp.school_id
  WHERE LOWER(s.school_code) = LOWER(p_school_code)
  AND LOWER(sp.username)   = LOWER(p_username);

  IF v_staff_id IS NOT NULL THEN
    v_attempts := v_attempts + 1;
    
    -- If 5 failures, lock for 15 minutes
    IF v_attempts >= 5 THEN
        UPDATE public.staff_profiles 
        SET failed_attempts = 0, -- Reset counter but set lock
            locked_until = NOW() + INTERVAL '15 minutes'
        WHERE id = v_staff_id;
        
        INSERT INTO public.login_audit (school_id, username, status)
        VALUES ((SELECT school_id FROM public.staff_profiles WHERE id = v_staff_id), p_username, 'locked');
    ELSE
        UPDATE public.staff_profiles 
        SET failed_attempts = v_attempts
        WHERE id = v_staff_id;
        
        INSERT INTO public.login_audit (school_id, username, status)
        VALUES ((SELECT school_id FROM public.staff_profiles WHERE id = v_staff_id), p_username, 'failed');
    END IF;
  END IF;
END;
$$;

-- 5. RPC to reset attempts on success
CREATE OR REPLACE FUNCTION public.reset_failed_login()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.staff_profiles 
  SET failed_attempts = 0, 
      locked_until = NULL
  WHERE id = auth.uid();
  
  INSERT INTO public.login_audit (school_id, username, status)
  VALUES (public.my_school_id(), (SELECT username FROM public.staff_profiles WHERE id = auth.uid()), 'success');
END;
$$;

-- Grant execution to anon (for failure recording) and authenticated (for reset)
GRANT EXECUTE ON FUNCTION public.record_failed_login(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.reset_failed_login() TO authenticated;

COMMIT;
