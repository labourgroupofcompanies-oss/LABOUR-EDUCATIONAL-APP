-- ============================================================
-- SQL Migration: Add Audience targeting to School Notifications
-- Date: 2026-06-05
-- ============================================================

BEGIN;

-- 1. Add 'audience' column to school_notifications table
-- Default to 'staff' so existing internal notifications remain private to staff.
ALTER TABLE public.school_notifications 
ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'staff'
CONSTRAINT chk_school_notifications_audience CHECK (audience IN ('staff', 'parents', 'all'));

-- 2. Update get_parent_announcements function to return notifications targeted for parents/everyone
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
          AND n.audience IN ('parents', 'all')
        ORDER BY n.created_at DESC
    ) t;
    
    RETURN json_build_object('success', true, 'announcements', COALESCE(records, '[]'::json));
END;
$$ LANGUAGE plpgsql;

-- 3. Re-grant execute permission
GRANT EXECUTE ON FUNCTION public.get_parent_announcements(text, text, uuid) TO anon, authenticated;

COMMIT;
